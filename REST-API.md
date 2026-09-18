# 展示架公开 REST API

接口基址：

```text
/apis/api.showcase.halo.run/v1alpha1/public/v1
```

所有公开接口均为只读 `GET`，返回 JSON，并使用独立 DTO，不包含 Halo Extension 的 `metadata`、`resourceVersion`、创建时间或后台设置对象。接口只读取展示架自己的数据，不修改 Halo 或其他插件的数据。

## 作品列表

```http
GET /items?category=anime&subcategory=2026&keyword=治愈&limit=20&offset=0
```

查询参数：

- `category`：分类 ID，最长 120 个字符。
- `subcategory`：二级标题 ID，最长 120 个字符。
- `keyword`：匹配标题、简介、观看感受、状态和标签，最长 100 个字符。
- `limit`：返回数量，默认 50，服务端硬上限 100；非法值使用默认值。
- `offset`：偏移量，默认 0，最大 10,000。

只返回 `published=true` 且所属分类 `visible=true` 的作品。作品指定二级标题时，该二级标题也必须可见并且属于同一分类。响应格式：

```json
{
  "items": [{
    "id": "showcase-item-abc",
    "title": "示例作品",
    "category": "anime",
    "subcategory": "2026",
    "cover": "https://example.com/cover.jpg",
    "description": "简介",
    "impression": "观看感受",
    "watchUrl": "https://example.com/watch",
    "externalUrl": "https://example.com",
    "tags": ["治愈"],
    "status": "已看完",
    "score": 8.5,
    "likes": 3,
    "priority": 1
  }],
  "offset": 0,
  "limit": 20,
  "total": 1,
  "hasMore": false
}
```

## 分类、二级标题和目录

```http
GET /categories
GET /subcategories?category=anime
GET /catalog?limit=100
```

分类和二级标题只返回可见数据。`catalog` 返回分类、二级标题及分页后的公开作品，分页字段与 `/items` 相同。

## 页面数据

```http
GET /page
```

返回 `/movie` 前端所需的安全页面配置，例如页面标题、主题色、背景媒体地址和评论开关。不会返回原始 `ShowcaseSettings`、内部资源版本、后台权限或其他插件的配置对象。

## 访客统计

```http
GET /stats
```

只读返回展示架自己的今日访客、今日访问、总访客和总访问计数，以及统计功能是否启用。该接口不会记录访问；需要计数的官方 `/movie` 页面仍使用原有、带限流保护的访问记录端点。

## 版本兼容

`/public/items`、`/public/categories`、`/public/subcategories`、`/public/catalog`、`/public/page`、`/public/stats` 是不带版本的稳定别名，当前与 `/public/v1/*` 行为一致。新客户端建议使用带版本的路径。

Steam 游戏来自独立的 Steam 信息展示插件，不由展示架复制或代理。主题需要展示 Steam 游戏时，应在 `/page` 返回 `steamEnabled=true` 后调用该插件自己的公开 API，避免展示架读取或泄露其他插件的后台配置。

## 安全约束

- 公开接口没有写入方法，不接受 POST、PUT、PATCH 或 DELETE。
- 返回数量和查询字符串长度均有限制，避免过大响应和资源消耗。
- 公开错误只返回固定提示，不回显服务器异常或数据结构。
- 匿名 RBAC 仅放行 `/public/v1/*` 和 `/public/*`，后台管理接口与原始 Extension 资源不向匿名用户开放。

从 1.6.2 起，匿名公开权限使用独立的 `role-template-showcase-public-v1` 角色资源。1.6.4 同时更新旧版 `role-template-showcase-anonymous` 资源，并按 Halo 对 CustomEndpoint 的实际解析方式声明 `apiGroups/resources`（`public/*`）权限，确保商城升级时已安装角色和新安装角色都能放行公开接口，避免访客被要求登录。

## 模板字段与自定义数据（1.7.x）

从 1.7.2 起，分类扩展支持挂载字段模板（`ShowcaseCategory.spec.template` 与 `templateFields`），作品扩展新增 `customFields`（`Map<String, String>`）字段，用于保存分类专属的额外信息，例如书籍的 ISBN、影视的导演、游戏的支持平台等。

`/public/v1/categories`、`/public/v1/subcategories`、`/public/v1/items`、`/public/v1/catalog` 等接口返回的分类对象会附带 `template` 与 `templateFields`，作品对象会附带 `customFields`。字段顺序与分类模板保持一致；未在分类中声明的 `customFields` 字段会被服务端过滤掉，避免历史脏数据泄露到前台。

公开响应示例（节选）：

```json
{
  "id": "anime",
  "displayName": "动漫",
  "template": "standard",
  "templateFields": [
    {"key": "author", "label": "原作", "type": "text", "required": false, "showInCard": true}
  ]
}
```

```json
{
  "id": "showcase-item-abc",
  "title": "示例作品",
  "category": "anime",
  "customFields": {"author": "示例原作"}
}
```

模板字段类型当前支持 `text`、`textarea`、`number`、`url`，公开响应只返回 `key`、`label`、`type`、`required`、`showInCard`、`placeholder`、`helpText` 等基础元数据，不包含 Halo 内部资源版本、模板编辑接口或其他管理字段。
