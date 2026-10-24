import { File } from 'expo-file-system';

/**
 * 极简 STORE 模式 zip 生成器。
 *
 * 备份包里体积最大的是 epub（本身已经是 zip 压缩过的），用它再 DEFLATE
 * 一次纯属浪费 CPU。这里只做 STORE（不压缩），并且逐条写入磁盘：
 * 内存峰值只取决于「单个最大文件」，而不是整个书库。
 *
 * 产出的 zip 与标准实现完全兼容，importBackup 侧（JSZip）可正常读取。
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const MAX_UINT32 = 0xffffffff;

interface CentralEntry {
  nameBytes: Uint8Array;
  crc: number;
  size: number;
  time: number;
  date: number;
  localOffset: number;
}

function dosDateTime(d: Date): { time: number; date: number } {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f);
  const date =
    (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

export interface ZipProgress {
  done: number;
  total: number;
  name: string;
}

export class ZipWriter {
  private writer: WritableStreamDefaultWriter<Uint8Array<ArrayBufferLike>>;
  private offset = 0;
  private entries: CentralEntry[] = [];
  private time: number;
  private date: number;
  private finished = false;

  private constructor(writer: WritableStreamDefaultWriter<Uint8Array<ArrayBufferLike>>) {
    this.writer = writer;
    const { time, date } = dosDateTime(new Date());
    this.time = time;
    this.date = date;
  }

  static async create(target: File): Promise<ZipWriter> {
    if (target.exists) target.delete();
    target.create({ intermediates: true });
    const writer = target.writableStream().getWriter();
    return new ZipWriter(writer);
  }

  private async write(bytes: Uint8Array): Promise<void> {
    await this.writer.write(bytes);
    this.offset += bytes.length;
  }

  async addBytes(name: string, data: Uint8Array): Promise<void> {
    if (this.finished) throw new Error('zip 已关闭');
    if (data.length > MAX_UINT32) throw new Error(`${name} 超过 4GB，无法打包`);

    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true); // local file header signature
    dv.setUint16(4, 20, true); // version needed
    dv.setUint16(6, 0, true); // flags
    dv.setUint16(8, 0, true); // method = store
    dv.setUint16(10, this.time, true);
    dv.setUint16(12, this.date, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, data.length, true);
    dv.setUint32(22, data.length, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true); // extra length
    local.set(nameBytes, 30);

    const localOffset = this.offset;
    await this.write(local);
    await this.write(data);

    this.entries.push({ nameBytes, crc, size: data.length, time: this.time, date: this.date, localOffset });
  }

  async finish(): Promise<void> {
    if (this.finished) return;
    this.finished = true;

    const cdStart = this.offset;
    for (const e of this.entries) {
      if (e.localOffset > MAX_UINT32) throw new Error('备份包超过 4GB，暂不支持');
      const header = new Uint8Array(46 + e.nameBytes.length);
      const dv = new DataView(header.buffer);
      dv.setUint32(0, 0x02014b50, true); // central directory header
      dv.setUint16(4, 20, true); // version made by
      dv.setUint16(6, 20, true); // version needed
      dv.setUint16(8, 0, true); // flags
      dv.setUint16(10, 0, true); // method
      dv.setUint16(12, e.time, true);
      dv.setUint16(14, e.date, true);
      dv.setUint32(16, e.crc, true);
      dv.setUint32(20, e.size, true);
      dv.setUint32(24, e.size, true);
      dv.setUint16(28, e.nameBytes.length, true);
      dv.setUint16(30, 0, true); // extra
      dv.setUint16(32, 0, true); // comment
      dv.setUint16(34, 0, true); // disk number
      dv.setUint16(36, 0, true); // internal attrs
      dv.setUint32(38, 0, true); // external attrs
      dv.setUint32(42, e.localOffset, true);
      header.set(e.nameBytes, 46);
      await this.write(header);
    }
    const cdSize = this.offset - cdStart;

    const eocd = new Uint8Array(22);
    const dv = new DataView(eocd.buffer);
    dv.setUint32(0, 0x06054b50, true);
    dv.setUint16(4, 0, true);
    dv.setUint16(6, 0, true);
    dv.setUint16(8, this.entries.length, true);
    dv.setUint16(10, this.entries.length, true);
    dv.setUint32(12, cdSize, true);
    dv.setUint32(16, cdStart, true);
    dv.setUint16(20, 0, true);
    await this.write(eocd);

    await this.writer.close();
  }
}
