package com.wangxinyang.showcase;

import com.wangxinyang.showcase.extension.ShowcaseCategory.TemplateField;
import com.wangxinyang.showcase.extension.ShowcaseTemplate;
import java.util.ArrayList;
import java.util.List;

/**
 * Single source of truth for the built-in content templates seeded on plugin start.
 * Both {@link ShowcasePlugin} (startup seed) and {@link ShowcaseEndpoint}
 * (reset-defaults endpoint) read from this registry so behaviour stays in sync.
 */
public final class PluginPresets {

    private PluginPresets() {
    }

    /** Container pairing a stable metadata.name with a fully-built extension object. */
    public record BuiltInTemplate(String name, ShowcaseTemplate template) {
    }

    /** Build the in-memory list of default templates. */
    public static List<BuiltInTemplate> builtInTemplates() {
        List<BuiltInTemplate> presets = new ArrayList<>();
        presets.add(build("preset-standard", "动漫影视",
            "完整的动漫影视字段：观看状态、评分、观看链接等", "🌸", List.of(
                field("status", "观看状态", "text", false, false, "已看完", null, "例如：在看 / 已看完 / 想看"),
                field("score", "个人评分", "number", false, true, "0", "/10",
                    "支持 0-10 分，可填一位小数"),
                field("likes", "点赞数量", "number", false, false, "0", null,
                    "可手动调整前台点赞累计数量，访客点赞后会继续在此基础上累加"),
                field("description", "作品简介", "textarea", false, false, "", null,
                    "一段话介绍这部作品；不填写则前台不显示该段"),
                field("impression", "观看后感受", "textarea", false, false, "", null,
                    "记录触动你的台词、人物或片段；不填写则前台不显示该段"),
                field("watchUrl", "观看链接", "url", false, false, "", null,
                    "在线观看入口；详情页会出现「去观看」按钮"),
                field("externalUrl", "其他链接", "url", false, false, "", null,
                    "官网 / 资料 / 讨论区；详情页会显示受主题色控制的「打开其他链接」卡片"),
                field("tags", "封面标签", "tags", false, true, "", null,
                    "多个标签用逗号分隔，最多 6 个；卡片和列表都会展示"),
                field("published", "立即发布", "text", false, false, "true", null,
                    "true / false：是否立即显示在 /movie"),
                field("priority", "排序值", "number", false, false, "0", null,
                    "数字越大越靠前；分类内拖拽改的是这个值"),
                field("category", "所属分类", "text", true, false, "", null,
                    "必填：来自分类管理"),
                field("subcategory", "二级标题", "text", false, false, "", null,
                    "可选：用于二级分组")
            )));
        presets.add(build("preset-food", "美食探店",
            "为餐厅、咖啡馆、甜品店打卡而设计", "☕", List.of(
                field("likes", "点赞数量", "number", false, false, "0", null,
                    "可手动调整前台点赞累计数量，访客点赞后会继续在此基础上累加"),
                field("description", "店铺简介", "textarea", false, false, "", null,
                    "通用简介；不填写则前台不显示该段"),
                field("avg_price", "人均价格", "number", true, true, "0", "元", "可填整数或带小数"),
                field("address", "地址", "text", true, false, "", null, "详细地址或街区名称"),
                field("open_hours", "营业时间", "text", false, false, "", null,
                    "例如：周一至周日 10:00 - 22:00"),
                field("recommended_dishes", "推荐菜", "textarea", false, false, "", null,
                    "推荐菜品、招牌饮品、最爱的小食"),
                field("tags", "封面标签", "tags", false, true, "", null,
                    "例如：麻辣、甜口、清淡、生酮、奶茶控；卡片左下角展示")
            )));
        presets.add(build("preset-travel", "旅行打卡",
            "记录去过的景点、城市与旅行故事", "🏨", List.of(
                field("likes", "点赞数量", "number", false, false, "0", null,
                    "可手动调整前台点赞累计数量，访客点赞后会继续在此基础上累加"),
                field("description", "景点简介", "textarea", false, false, "", null,
                    "通用简介；不填写则前台不显示该段"),
                field("spot", "景点名称", "text", true, false, "", null, "国家/城市/景区名"),
                field("ticket", "门票", "text", false, true, "", null,
                    "例如：免费 / 80元 / 需提前预约"),
                field("transport", "交通方式", "textarea", false, false, "", null,
                    "如何到达、停车、地铁线路等"),
                field("best_season", "最佳季节", "text", false, false, "", null,
                    "例如：春季樱花、秋季红叶"),
                field("tags", "封面标签", "tags", false, true, "", null,
                    "例如：亲子、徒步、自驾、Citywalk；卡片左下角展示")
            )));
        presets.add(build("preset-book", "书单笔记",
            "记录书摘、章节感想与阅读进度", "📖", List.of(
                field("likes", "点赞数量", "number", false, false, "0", null,
                    "可手动调整前台点赞累计数量，访客点赞后会继续在此基础上累加"),
                field("description", "内容简介", "textarea", false, false, "", null,
                    "通用简介；不填写则前台不显示该段"),
                field("author", "作者", "text", true, true, "", null, "作者姓名"),
                field("publisher", "出版社", "text", false, false, "", null, ""),
                field("chapter", "章节", "text", false, false, "", null,
                    "例如：第三章 / 第七节"),
                field("quote", "摘录", "textarea", false, false, "", null,
                    "触动你的原文段落"),
                field("note", "读后感", "textarea", false, false, "", null,
                    "你的想法、感悟、行动启发"),
                field("tags", "封面标签", "tags", false, true, "", null,
                    "例如：小说、随笔、科幻；卡片左下角展示")
            )));
        presets.add(build("preset-sport", "运动记录",
            "记录跑步、骑行、健身等运动数据", "🏃", List.of(
                field("likes", "点赞数量", "number", false, false, "0", null,
                    "可手动调整前台点赞累计数量，访客点赞后会继续在此基础上累加"),
                field("description", "运动笔记", "textarea", false, false, "", null,
                    "通用简介；不填写则前台不显示该段"),
                field("activity", "运动类型", "text", true, true, "", null,
                    "例如：跑步、骑行、游泳、撸铁；卡片会展示"),
                field("distance", "距离", "number", false, true, "0", "km", ""),
                field("pace", "配速 / 时长", "text", false, true, "", null,
                    "例如：5'30\"/km 或 1 小时 30 分钟"),
                field("heart_rate", "心率", "number", false, false, "0", "bpm",
                    "平均心率或最大心率"),
                field("activity_date", "运动日期", "date", true, false, "", null,
                    "运动发生的日期"),
                field("tags", "封面标签", "tags", false, true, "", null,
                    "例如：跑步、夜跑、力量训练；卡片左下角展示")
            )));
        presets.add(build("preset-product", "好物推荐",
            "记录心仪好物、品牌、价格与购买链接", "🛍️", List.of(
                field("likes", "点赞数量", "number", false, false, "0", null,
                    "可手动调整前台点赞累计数量，访客点赞后会继续在此基础上累加"),
                field("description", "推荐理由", "textarea", false, false, "", null,
                    "通用简介；不填写则前台不显示该段"),
                field("brand", "品牌", "text", true, true, "", null, ""),
                field("model", "型号 / 规格", "text", false, false, "", null, ""),
                field("price", "价格", "number", false, true, "0", "元", ""),
                field("buy_url", "购买链接", "url", false, false, "", null,
                    "电商链接或官网"),
                field("tags", "封面标签", "tags", false, true, "", null,
                    "例如：数码、家居、美妆、户外；卡片左下角展示")
            )));
        return presets;
    }

    private static BuiltInTemplate build(String name, String displayName, String description,
        String icon, List<TemplateField> fields) {
        var template = new ShowcaseTemplate();
        var metadata = new run.halo.app.extension.Metadata();
        metadata.setName(name);
        template.setMetadata(metadata);
        var spec = new ShowcaseTemplate.TemplateSpec();
        spec.setDisplayName(displayName);
        spec.setDescription(description);
        spec.setIcon(icon);
        spec.setFields(new ArrayList<>(fields));
        template.setSpec(spec);
        return new BuiltInTemplate(name, template);
    }

    private static TemplateField field(String key, String label, String type, boolean required,
        boolean showInCard, String defaultValue, String unit, String helpText) {
        var f = new TemplateField();
        f.setKey(key);
        f.setLabel(label);
        f.setType(type);
        f.setRequired(required);
        f.setShowInCard(showInCard);
        f.setDefaultValue(defaultValue);
        f.setUnit(unit);
        f.setHelpText(helpText);
        f.setBuiltin(true);
        return f;
    }
}