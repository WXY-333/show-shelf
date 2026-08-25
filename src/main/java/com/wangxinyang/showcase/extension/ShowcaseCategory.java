package com.wangxinyang.showcase.extension;

import lombok.Data;
import lombok.EqualsAndHashCode;
import run.halo.app.extension.AbstractExtension;
import run.halo.app.extension.GVK;

@Data
@EqualsAndHashCode(callSuper = true)
@GVK(group = "showcase.halo.run", version = "v1alpha1", kind = "ShowcaseCategory",
    plural = "showcasecategories", singular = "showcasecategory")
public class ShowcaseCategory extends AbstractExtension {
    private CategorySpec spec = new CategorySpec();

    @Data
    public static class CategorySpec {
        private String displayName;
        private String description;
        private String icon = "🌸";
        private Integer priority = 0;
        private Boolean visible = true;
    }
}
