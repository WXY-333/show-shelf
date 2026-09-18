# 展示架（Plugin Showcase）

一个面向 [Halo 2](https://github.com/halo-dev/halo) 的独立收藏展示插件，通过 **/movie** 公开展示动漫、影视、书籍、游戏及其他个人收藏。

![Version](https://img.shields.io/badge/Version-1.7.1-1f6feb?style=flat-square) ![Halo](https://img.shields.io/badge/Halo-%E2%89%A5%202.23.0-0a84f7?style=flat-square) ![License](https://img.shields.io/badge/License-MIT-22c55e?style=flat-square)

[在线演示](https://wangxinyang.top/movie) ｜ [使用教程](https://www.wangxinyang.top/archives/halo-zhan-shi-jia-da-zao-zi-ji-de-zhuan-shu-shou-cang-zhan-shi-ye-mian) ｜ [版本下载](https://github.com/WXY-333/show-shelf/releases) ｜ [问题反馈](https://github.com/WXY-333/show-shelf/issues)

## 项目介绍

展示架不依赖 Halo 主题样式，启用后在 Halo Console 的“内容”分组中提供管理入口，并生成访客无需登录即可访问的独立页面。前台支持卡片和列表视图、分类与二级标题、搜索、详情弹窗、主题色、昼夜模式、背景媒体及动效；后台支持完整内容管理、拖拽排序、分类模板、自定义字段和 Bangumi 条目解析。

## 界面预览

![展示架页面](https://wangxinyang.top/upload/%E5%B1%8F%E5%B9%95%E6%88%AA%E5%9B%BE%202026-08-30%20224342.png)

![夜间模式与详情弹窗](https://wangxinyang.top/upload/%E5%B1%8F%E5%B9%95%E6%88%AA%E5%9B%BE%202026-08-30%20224412.png)

## 核心功能

### 内容管理

- 新增、编辑、删除、发布或隐藏展示内容。
- 支持标题、分类、二级标题、封面、简介、观看感受、状态、评分、标签、观看链接及其他链接。
- 支持从 Halo 附件库选择封面并预览，也支持外部图片 URL。
- 支持粘贴 Bangumi 条目链接或 ID，一键解析封面、标题、评分、简介和标签。
- 后台提供卡片与列表两种管理视图，支持同组拖拽排序。
- 可设置新增内容默认放在所属分组的开头或末尾。

### 分类、模板与自定义字段

- 支持动漫、影视、书籍、游戏、音乐、旅行及任意自定义分类。
- 每个分类可创建二级标题，用于年度、主题或状态分组。
- 分类支持名称、Emoji、说明、排序和前台可见状态。
- 分类可绑定模板，字段支持文本、长文本、数字、日期、链接、图片和标签。
- 字段可设置必填、单位、提示文字、排序及是否显示在卡片上。
- 内置动漫影视、美食探店、旅行打卡、书单笔记、运动记录和好物推荐模板，也支持自定义模板。
- 切换分类或调整模板时保留已有字段数据。

### 前台展示与交互

- 使用独立的 **/movie** 页面，不依赖当前 Halo 主题结构和样式。
- 页面使用 Halo 原生模板渲染，支持已启用插件的 head/body 原生注入（如 Live2D），不抓取博客首页。
- 支持分类、二级标题及标题、简介、感受、标签关键词搜索。
- 支持卡片与列表视图切换；卡片提供小、大、大大三档尺寸，默认四列布局。
- 卡片封面保持固定比例，详情弹窗支持长内容独立滚动。
- 外部链接先显示离站确认，降低误触风险。
- 页面右下角提供快速返回顶部和滚动到底部按钮。
- 可选访客统计，显示今日访客、今日访问、总访客和总访问。

### 主题与个性化

- 通过颜色选择器、色相滑块或十六进制码设置整体主题色。
- 主题色应用于按钮、评分、滚动条、评论区和页面装饰。
- 顶部与内容区支持图片或 MP4 背景，并可调节透明度和饱和度。
- 支持白天/黑夜模式、自定义英文签名和 SVG 书写动画。
- 支持樱花飘落、繁星点点、鱼群与水波动画。
- 系统开启“减少动态效果”时自动减少装饰动画。

### 评论系统

支持 Halo 官方评论组件、[评论组件 Next](https://github.com/acanyo/plugin-comment-next) 和 Twikoo，页面底部评论与作品详情评论可以分别开启。

| 评论系统 | 说明 |
| --- | --- |
| Halo 官方评论组件 | Halo 原生评论界面、数据和管理流程 |
| 评论组件 Next | 增强评论界面，与官方组件共用 Halo 评论数据 |
| Twikoo | 支持 Vercel、自建服务地址或腾讯云环境 ID |

- 官方组件与 Next 共用 Halo 原生评论数据，切换组件不会拆分或重复存储评论。
- 评论框、按钮和状态颜色跟随展示架主题色与昼夜模式。
- 可选匿名邮箱适配：访客填写昵称后，由展示架在提交前补充匿名邮箱。
- 适配仅作用于展示架页面，不修改评论插件源码、数据接口、登录、验证码、审核或通知流程。
- 优化评论切换同步、表情面板、回复区域和管理提示的层级与裁切。
- 优化移动端详情滚动和 Comment Next 表情分类横向滑动。

### Steam 游戏联动

配合“Steam 信息展示”插件自动增加游戏分类，展示游戏封面、名称、累计游玩时间、最近游玩日期和 Steam 入口。依赖未安装时显示明确提示，不影响其他分类；游戏数据不会复制到展示架内容库。

## 系统要求

- Halo 2.23.0 及以上。
- 已在 Halo 2.26.0 完成主要功能测试。
- 评论功能需安装所选评论组件或完成 Twikoo 配置。
- Steam 联动需安装并启用“Steam 信息展示”插件。

## 安装与升级

1. 在 Halo 应用市场搜索“展示架”或“Showcase”，或从 [Releases](https://github.com/WXY-333/show-shelf/releases) 下载 **plugin-showcase-1.7.1.jar**。
2. 进入“插件 → 安装插件”，上传 JAR 并启动展示架。
3. 打开“内容 → 展示架”完成分类、内容和页面设置。
4. 访问 **/movie** 查看公开页面。

升级前建议备份 Halo 数据目录。正常升级不会主动删除展示内容、分类、模板或页面设置。

## 快速开始

1. 在分类管理中确认或创建分类和二级标题。
2. 选择内置模板或创建自定义模板。
3. 在展示内容中新增内容，也可以使用 Bangumi 解析。
4. 设置封面、标题、简介、评分、标签和链接并发布。
5. 在页面设置中调整主题色、背景、动效、布局、评论和访客统计。

## 页面设置

| 设置类别 | 可配置内容 |
| --- | --- |
| 基础信息 | 页面标题、副标题、统计区文字、英文签名 |
| 展示布局 | 卡片/列表视图、卡片尺寸、新增内容默认位置 |
| 主题样式 | 整体主题色、昼夜模式、滚动条及按钮颜色 |
| 背景媒体 | 顶部与内容区图片/视频、透明度、饱和度 |
| 页面动效 | 樱花、繁星、鱼群和水波效果 |
| 评论设置 | 评论系统、页面评论、详情评论、匿名邮箱适配 |
| 访客统计 | 今日访客、今日访问、总访客和总访问 |
| 插件联动 | Steam 游戏联动及依赖状态 |

## 权限说明

- **展示架查看**：进入插件后台并读取展示内容。
- **展示架管理**：新增、修改、删除内容、分类和模板，并保存页面设置。
- **匿名访问**：读取已发布内容、可见分类、公开页面配置和只读统计数据。

非超级管理员需授予相应角色；从 Halo 附件库选择封面或背景还需要附件读取权限。

## 数据与公开接口

展示内容、分类、二级标题、模板和页面设置通过 Halo Extension API 持久化。公开只读接口包括：

    GET /apis/api.showcase.halo.run/v1alpha1/public/v1/items
    GET /apis/api.showcase.halo.run/v1alpha1/public/v1/categories
    GET /apis/api.showcase.halo.run/v1alpha1/public/v1/subcategories
    GET /apis/api.showcase.halo.run/v1alpha1/public/v1/catalog
    GET /apis/api.showcase.halo.run/v1alpha1/public/v1/page
    GET /apis/api.showcase.halo.run/v1alpha1/public/v1/stats

作品接口支持 category、subcategory、keyword、limit 和 offset 参数，只返回已发布且分类可见的数据。完整参数、响应示例和安全约束见 [REST-API.md](REST-API.md)。

## 本地构建

构建环境：JDK 21。

Windows：

    .\gradlew.bat clean test build --no-daemon

Linux 或 macOS：

    ./gradlew clean test build --no-daemon

构建产物：**build/libs/plugin-showcase-1.7.1.jar**

## 项目结构

    src/main/java/                  Java 插件逻辑、API、路由与数据模型
    src/main/resources/console/    Halo Console 管理界面
    src/main/resources/templates/movie.html  /movie 页面模板
    src/main/resources/static/     CSS、JS 与动画资源
    src/main/resources/extensions/ 权限角色与静态资源代理规则

## 1.7.1 版本概要

- 新增后台展示内容搜索框，支持按标题、简介、观看感受、状态和标签实时过滤。
- 新增 TMDB 链接解析：内容编辑弹窗中粘贴 themoviedb.org 电影或剧集链接即可一键填入封面、标题、评分、简介和标签。
- TMDB API Key 在后台设置中持久化保存，仅通过登录后的管理接口读取，匿名公开接口不返回该字段。
- `/movie` 页面改用 Halo 原生模板渲染，已启用插件的 head/body 资源（如 Live2D 看板娘）可正常注入显示。
- 修复后台设置的“新增展示内容默认位置”保存后不回显的问题。

## 1.7.0 版本概要

- 新增分类模板、自定义字段、六类内置模板和 Bangumi 一键解析。
- 新增前后台卡片/列表视图、三档卡片尺寸、访客统计和快速置顶/置底。
- 支持 Halo 官方评论组件、评论组件 Next、Twikoo、页面评论和详情评论。
- 新增匿名邮箱轻量适配，优化评论切换、主题色、移动端详情和表情面板。

精简发布说明见 [1.7.0版本更新说明.md](1.7.0版本更新说明.md)。
## 注意事项

- 外部链接仅允许 HTTP 或 HTTPS；外部封面和背景必须允许浏览器公开访问。
- 昼夜模式和前台视图偏好保存在访客浏览器中，不修改后台全局设置。
- 评论审核、通知、登录和验证码仍由对应评论系统或 Halo 负责。
- 展示架的评论适配仅在自身页面生效，不修改其他插件源码或全局运行逻辑。

## 项目信息

- **插件名称：** 展示架（Plugin Showcase）
- **当前版本：** 1.7.1
- **插件标识：** showcase
- **作者：** Wangxinyang
- **开源协议：** MIT
- **源码仓库：** <https://github.com/WXY-333/show-shelf>
- **问题反馈：** <https://github.com/WXY-333/show-shelf/issues>
- **演示站点：** <https://wangxinyang.top/movie>

## 许可证

本项目基于 [MIT License](LICENSE) 开源。
