# 小说阅读管理 (novel-manager)

一个纯粹的**本地**小说/漫画收藏管理 App，用手机替代 Excel 书单。所有数据保存在手机本地 SQLite 中，不联网、不上传、不做任何自动判断——阅读状态、阅读时间、卷数等全部由你手动填写。

- Android（arm64-v8a）· React Native 0.88 / Expo SDK 58 · TypeScript · expo-sqlite
- Material 3 深色主题（青蓝主色 + 深紫灰背景）
- 无广告、无账号、无网络权限

## 功能

**书架**
- 左图右文卡片列表，显示封面、书名/日文原名、作者/画师、阅读状态、卷数进度、评分
- 排序：最近修改 / 评分 / 最新卷（点击切换升序/降序）
- 复合筛选：标签包含/排除、阅读状态、作品状态、作者、文库、阅读方式
- 搜索：书名、日文名、作者、画师、文库、标签、书评（不搜数值字段），命中高亮

**书籍**
- 新增/编辑/删除；除书名外所有字段可空
- 阅读状态（未读/在读/弃书/已读）与作品状态（连载中/已完结）分开记录
- 分段阅读记录：起止日期 + 卷数区间，一本书可有多段
- 标签：分组 + 颜色 chip，可即时新建标签并指定分组
- 评分 1–10、购入价/回血、书评、总卷数与读到第几卷（均支持小数，如 7.5）

**电子书 (epub)**
- 绑定本地 epub 文件（拷贝进 App 私有目录，不是记路径）
- 区分「正文 / 短篇」，同一本书同一类型卷号唯一
- 自动从 epub 内提取卷 1 封面作为书籍封面（也可手动选图）
- 点击直接用系统外部阅读器（如 MoonReader）打开
- **批量绑定**：一次多选 epub，按文件名自动匹配书籍与卷号，可手动纠正后再导入

**统计**
- 总藏书 / 今年读完 / 总费用 / 总回血
- 当前在读、连载中的小说、上一本读完

**备份**
- 导出为 zip（JSON 全表数据 + 封面/epub 文件），导入可 100% 还原
- 备份格式固定，向后兼容

## 目录结构

```
src/
  app/                 # expo-router 路由
    (tabs)/            # 书架 / 统计 / 设置
    book/[id].tsx      # 书籍详情
    book/new.tsx       # 新增
    book/[id]/edit.tsx # 编辑
    epub/[bookId].tsx  # 单本 epub 管理
    epub/batch.tsx     # 批量绑定 epub
    tag-manager.tsx    # 标签与分组管理
  components/          # BookCard / BookForm / FilterSheet / TagChip ...
  db/                  # schema + 各表 DAO + 备份导入导出
  theme/               # Material 3 主题
  types/               # 数据模型
  utils/               # 日期/格式化/文件/epub 解析/标题匹配/高亮
tools/
  excel_to_backup.py   # Excel 书单 → App 备份 zip
plugins/
  withAndroidObjectPathMax.js  # 修正 Windows 长路径导致的 CMake 构建失败
```

## 数据库

`books` `reading_logs` `tag_groups` `tags` `book_tags` `epub_files` 六张表，schema 见 `src/db/schema.ts`（`PRAGMA user_version` 做版本迁移）。

## 开发

```bash
pnpm install
pnpm start          # Metro，用 Expo Go 扫码
pnpm android        # 或直接编译到已连接的设备
pnpm exec tsc --noEmit
```

## 构建 APK

```bash
pnpm exec expo prebuild --platform android --no-install
cd android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
# 产物：android/app/build/outputs/apk/release/app-release.apk
```

需要 JDK 17、Android SDK（compileSdk 37 / build-tools 37.0.0 / NDK 27.1.12297006）。

**Windows 注意**：RN 默认给 app 的 CMake 传 `-DCMAKE_OBJECT_PATH_MAX=1024`，会让代码生成的对象文件路径超过 260 字符上限（`react-native-gesture-handler` 最先报错）。仓库里的 `plugins/withAndroidObjectPathMax.js` 会在 prebuild 时把它改成 250，让 CMake 使用哈希短路径。另外工程目录本身不要放太深。

## Excel 导入

```bash
python tools/excel_to_backup.py 书单.xlsx -o 输出.zip
```

生成的 zip 直接在 App「设置 → 导入备份」里选择即可。列映射见脚本头部注释（A 日期 / B 简中译名 / C 日文原名 / D 作者 / E 画师 / F 文库 / G 卷数 / H 忽略 / I 类型→标签 / J 情况→阅读状态 / K 方式 / L 费用 / M 回本）。

## License

MIT
