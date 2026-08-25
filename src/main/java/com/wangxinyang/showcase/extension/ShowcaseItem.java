package com.wangxinyang.showcase.extension;

import lombok.Data;
import lombok.EqualsAndHashCode;
import run.halo.app.extension.AbstractExtension;
import run.halo.app.extension.GVK;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Data
@EqualsAndHashCode(callSuper = true)
@GVK(group = "showcase.halo.run", version = "v1alpha1", kind = "ShowcaseItem",
    plural = "showcaseitems", singular = "showcaseitem")
public class ShowcaseItem extends AbstractExtension {
    private ItemSpec spec = new ItemSpec();

    @Data
    public static class ItemSpec {
        private String title;
        private String category;
        private String subcategory;
        private String cover;
        private String description;
        private String impression;
        private String watchUrl;
        private String externalUrl;
        /** Short labels rendered on the lower-left corner of the cover. */
        private List<String> tags = new ArrayList<>();
        private String status = "已看完";
        /** Personal score from 0 to 10, with at most one decimal place. */
        private BigDecimal score = BigDecimal.ZERO;
        private Integer likes = 0;
        private Integer priority = 0;
        private Boolean published = true;
    }
}
