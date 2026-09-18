package com.wangxinyang.showcase.extension;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;
import lombok.EqualsAndHashCode;
import run.halo.app.extension.AbstractExtension;
import run.halo.app.extension.GVK;

@Data
@EqualsAndHashCode(callSuper = true)
@GVK(group = "showcase.halo.run", version = "v1alpha1", kind = "ShowcaseTemplate",
    plural = "showcasetemplates", singular = "showcasetemplate")
public class ShowcaseTemplate extends AbstractExtension {
    private TemplateSpec spec = new TemplateSpec();

    @Data
    public static class TemplateSpec {
        private String displayName;
        private String description;
        private String icon = "✨";
        private List<ShowcaseCategory.TemplateField> fields = new ArrayList<>();
    }
}
