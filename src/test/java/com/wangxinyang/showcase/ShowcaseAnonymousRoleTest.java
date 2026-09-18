package com.wangxinyang.showcase;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

class ShowcaseAnonymousRoleTest {

    @Test
    void publicApiRoleUsesUpgradeSafeNameAndAllowsEveryPublicReadEndpoint() throws Exception {
        var yaml = new ClassPathResource("extensions/showcase-roles.yaml")
            .getContentAsString(StandardCharsets.UTF_8);

        assertThat(yaml).contains("name: role-template-showcase-public-v1")
            .contains("name: role-template-showcase-anonymous")
            .contains("rbac.authorization.halo.run/aggregate-to-anonymous: \"true\"");
        for (var endpoint : new String[] {
            "items", "categories", "subcategories", "catalog", "page", "stats"
        }) {
            assertThat(yaml).contains(
                "/apis/api.showcase.halo.run/v1alpha1/public/v1/" + endpoint);
            assertThat(yaml).contains("public/" + endpoint);
        }
    }
}
