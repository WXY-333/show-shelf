package com.wangxinyang.showcase;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.wangxinyang.showcase.extension.ShowcaseCategory;
import com.wangxinyang.showcase.extension.ShowcaseItem;
import com.wangxinyang.showcase.extension.ShowcaseSubcategory;
import com.wangxinyang.showcase.extension.ShowcaseTemplate;
import java.util.Comparator;
import java.util.List;
import java.util.function.Predicate;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Flux;
import run.halo.app.extension.Metadata;
import run.halo.app.extension.ReactiveExtensionClient;

class ShowcasePublicApiTest {

    @Test
    void onlyReturnsPublishedItemsFromMatchingVisibleTaxonomy() {
        var client = clientWith(
            List.of(category("anime", true), category("books", true), category("hidden", false)),
            List.of(subcategory("anime-2026", "anime", true),
                subcategory("anime-hidden", "anime", false),
                subcategory("books-2026", "books", true)),
            List.of(item("public", "治愈作品", "anime", "anime-2026", true),
                item("draft", "治愈草稿", "anime", "anime-2026", false),
                item("hidden-category", "治愈隐藏", "hidden", "", true),
                item("hidden-subcategory", "治愈隐藏标题", "anime", "anime-hidden", true),
                item("wrong-subcategory", "治愈错绑", "anime", "books-2026", true)));

        WebTestClient.bindToRouterFunction(new ShowcaseEndpoint(client).endpoint()).build()
            .get().uri("/public/v1/items?category=anime&subcategory=anime-2026&keyword=治愈&limit=20")
            .header("Accept", "application/json")
            .exchange()
            .expectStatus().isOk()
            .expectHeader().valueEquals("X-Content-Type-Options", "nosniff")
            .expectBody()
            .jsonPath("$.total").isEqualTo(1)
            .jsonPath("$.items[0].id").isEqualTo("public")
            .jsonPath("$.items[0].metadata").doesNotExist()
            .jsonPath("$.items[0].published").doesNotExist();
    }

    @Test
    void clampsPublicPageSizeToOneHundred() {
        var items = java.util.stream.IntStream.range(0, 105)
            .mapToObj(index -> item("item-" + index, "作品 " + index, "anime", "", true))
            .toList();
        var client = clientWith(List.of(category("anime", true)), List.of(), items);

        WebTestClient.bindToRouterFunction(new ShowcaseEndpoint(client).endpoint()).build()
            .get().uri("/public/v1/items?limit=999")
            .header("Accept", "application/json")
            .exchange()
            .expectStatus().isOk()
            .expectBody()
            .jsonPath("$.limit").isEqualTo(100)
            .jsonPath("$.total").isEqualTo(105)
            .jsonPath("$.hasMore").isEqualTo(true)
            .jsonPath("$.items.length()").isEqualTo(100);
    }

    @SuppressWarnings("unchecked")
    private ReactiveExtensionClient clientWith(List<ShowcaseCategory> categories,
        List<ShowcaseSubcategory> subcategories, List<ShowcaseItem> items) {
        var client = mock(ReactiveExtensionClient.class);
        when(client.list(eq(ShowcaseCategory.class), any(), any())).thenAnswer(invocation -> {
            var predicate = (Predicate<ShowcaseCategory>) invocation.getArgument(1);
            var comparator = (Comparator<ShowcaseCategory>) invocation.getArgument(2);
            return Flux.fromIterable(categories).filter(predicate).sort(comparator);
        });
        when(client.list(eq(ShowcaseSubcategory.class), any(), any())).thenAnswer(invocation -> {
            var predicate = (Predicate<ShowcaseSubcategory>) invocation.getArgument(1);
            var comparator = (Comparator<ShowcaseSubcategory>) invocation.getArgument(2);
            return Flux.fromIterable(subcategories).filter(predicate).sort(comparator);
        });
        when(client.list(eq(ShowcaseItem.class), any(), any())).thenAnswer(invocation -> {
            var predicate = (Predicate<ShowcaseItem>) invocation.getArgument(1);
            var comparator = (Comparator<ShowcaseItem>) invocation.getArgument(2);
            return Flux.fromIterable(items).filter(predicate).sort(comparator);
        });
        when(client.list(eq(ShowcaseTemplate.class), any(), any())).thenAnswer(invocation -> {
            var predicate = (Predicate<ShowcaseTemplate>) invocation.getArgument(1);
            var comparator = (Comparator<ShowcaseTemplate>) invocation.getArgument(2);
            return Flux.<ShowcaseTemplate>empty().sort(comparator);
        });
        return client;
    }

    private ShowcaseCategory category(String name, boolean visible) {
        var category = new ShowcaseCategory();
        category.setMetadata(metadata(name));
        category.getSpec().setDisplayName(name);
        category.getSpec().setVisible(visible);
        return category;
    }

    private ShowcaseSubcategory subcategory(String name, String categoryName, boolean visible) {
        var subcategory = new ShowcaseSubcategory();
        subcategory.setMetadata(metadata(name));
        subcategory.getSpec().setCategory(categoryName);
        subcategory.getSpec().setDisplayName(name);
        subcategory.getSpec().setVisible(visible);
        return subcategory;
    }

    private ShowcaseItem item(String name, String title, String categoryName,
        String subcategoryName, boolean published) {
        var item = new ShowcaseItem();
        item.setMetadata(metadata(name));
        item.getSpec().setTitle(title);
        item.getSpec().setCategory(categoryName);
        item.getSpec().setSubcategory(subcategoryName);
        item.getSpec().setPublished(published);
        return item;
    }

    private Metadata metadata(String name) {
        var metadata = new Metadata();
        metadata.setName(name);
        return metadata;
    }
}
