package com.wangxinyang.showcase.extension;

import lombok.Data;
import lombok.EqualsAndHashCode;
import run.halo.app.extension.AbstractExtension;
import run.halo.app.extension.GVK;

@Data
@EqualsAndHashCode(callSuper = true)
@GVK(group = "showcase.halo.run", version = "v1alpha1", kind = "ShowcaseSettings",
    plural = "showcasesettings", singular = "showcasesetting")
public class ShowcaseSettings extends AbstractExtension {
    public static final String DEFAULT_THEME_COLOR = "#E96F9D";

    private SettingsSpec spec = defaults();

    public static SettingsSpec defaults() {
        var spec = new SettingsSpec();
        spec.setPageTitle("我的动漫展示架");
        spec.setSubtitle("把喜欢的故事，珍藏在一片樱花色里");
        spec.setOwnerText("一格一格，都是看过世界的痕迹");
        spec.setThemeColor(DEFAULT_THEME_COLOR);
        spec.setEffectEnabled(true);
        spec.setEffectType("sakura");
        spec.setCommentEnabled(true);
        spec.setSteamEnabled(false);
        spec.setHeroGifEnabled(true);
        spec.setHeroGifUrl("/plugins/showcase/assets/static/gif.gif");
        spec.setVisitorStatsEnabled(false);
        spec.setHeroBackgroundEnabled(false);
        spec.setHeroBackgroundType("image");
        spec.setHeroBackgroundUrl("");
        spec.setHeroBackgroundOpacity(28);
        spec.setHeroBackgroundSaturation(100);
        spec.setContentBackgroundEnabled(false);
        spec.setContentBackgroundType("image");
        spec.setContentBackgroundUrl("");
        spec.setContentBackgroundOpacity(18);
        spec.setContentBackgroundSaturation(100);
        spec.setSignatureEnabled(true);
        spec.setSignatureText("Keep discovering beautiful stories");
        return spec;
    }

    @Data
    public static class SettingsSpec {
        private String pageTitle;
        private String subtitle;
        private String ownerText;
        private String themeColor;
        private Boolean effectEnabled;
        private String effectType;
        private Boolean commentEnabled;
        private Boolean steamEnabled;
        private Boolean heroGifEnabled;
        private String heroGifUrl;
        private Boolean visitorStatsEnabled;
        private Boolean heroBackgroundEnabled;
        private String heroBackgroundType;
        private String heroBackgroundUrl;
        private Integer heroBackgroundOpacity;
        private Integer heroBackgroundSaturation;
        private Boolean contentBackgroundEnabled;
        private String contentBackgroundType;
        private String contentBackgroundUrl;
        private Integer contentBackgroundOpacity;
        private Integer contentBackgroundSaturation;
        private Boolean signatureEnabled;
        private String signatureText;
    }
}
