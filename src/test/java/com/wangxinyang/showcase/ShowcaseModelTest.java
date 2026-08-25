package com.wangxinyang.showcase;

import static org.assertj.core.api.Assertions.assertThat;

import com.wangxinyang.showcase.extension.ShowcaseCategory;
import com.wangxinyang.showcase.extension.ShowcaseItem;
import com.wangxinyang.showcase.extension.ShowcaseSettings;
import org.junit.jupiter.api.Test;
import run.halo.app.extension.Scheme;

class ShowcaseModelTest {

    @Test
    void shouldExposeExpectedExtensionKinds() {
        assertThat(Scheme.buildFromType(ShowcaseItem.class).groupVersionKind().group())
            .isEqualTo("showcase.halo.run");
        assertThat(Scheme.buildFromType(ShowcaseItem.class).plural()).isEqualTo("showcaseitems");
        assertThat(Scheme.buildFromType(ShowcaseCategory.class).plural())
            .isEqualTo("showcasecategories");
        assertThat(Scheme.buildFromType(ShowcaseSettings.class).plural())
            .isEqualTo("showcasesettings");
    }

    @Test
    void shouldProvideFriendlyDefaults() {
        var settings = ShowcaseSettings.defaults();
        assertThat(settings.getPageTitle()).isEqualTo("我的动漫展示架");
        assertThat(settings.getSubtitle()).isNotBlank();
        assertThat(settings.getThemeColor()).isEqualTo("#E96F9D");
        assertThat(settings.getEffectEnabled()).isTrue();
        assertThat(settings.getEffectType()).isEqualTo("sakura");
        assertThat(settings.getCommentEnabled()).isTrue();
        assertThat(settings.getSteamEnabled()).isFalse();
        assertThat(new ShowcaseItem().getSpec().getPublished()).isTrue();
        assertThat(new ShowcaseCategory().getSpec().getVisible()).isTrue();
    }
}
