package com.wangxinyang.showcase.extension;

import lombok.Data;
import lombok.EqualsAndHashCode;
import run.halo.app.extension.AbstractExtension;
import run.halo.app.extension.GVK;
import java.util.ArrayList;
import java.util.List;

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
        private Integer priority = 1;
        private Boolean visible = true;
        /** Optional content template identifier. Blank keeps the legacy fields. */
        private String template = "standard";
        /** Custom fields shown for items in this category. */
        private List<TemplateField> templateFields = new ArrayList<>();
    }

    @Data
    public static class TemplateField {
        private String key;
        private String label;
        /** Field type: text, textarea, number, url, date, image, tags. */
        private String type = "text";
        private Boolean required = false;
        private Boolean showInCard = false;
        private String placeholder;
        private String helpText;
        /** Optional unit suffix rendered next to number inputs, e.g. "元", "km". */
        private String unit;
        /** Optional default value pre-filled into the form. */
        private String defaultValue;
        /** Whether this field is a built-in system field that cannot be removed. */
        private Boolean builtin = false;
        /**
         * Hint rendered in the editor to remind the user that this field is
         * wired to the public card renderer (likes, description, cover tags).
         * Purely a UI marker; the field can still be deleted or hidden.
         */
        private Boolean core = false;
    }
}
