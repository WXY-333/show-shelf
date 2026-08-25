package com.wangxinyang.showcase.extension;

import lombok.Data;
import lombok.EqualsAndHashCode;
import run.halo.app.extension.AbstractExtension;
import run.halo.app.extension.GVK;

@Data
@EqualsAndHashCode(callSuper = true)
@GVK(group = "showcase.halo.run", version = "v1alpha1", kind = "ShowcaseSubcategory",
    plural = "showcasesubcategories", singular = "showcasesubcategory")
public class ShowcaseSubcategory extends AbstractExtension {
    private SubcategorySpec spec = new SubcategorySpec();

    @Data
    public static class SubcategorySpec {
        private String category;
        private String displayName;
        private String description;
        private String icon = "✦";
        private Integer priority = 0;
        private Boolean visible = true;
    }
}
