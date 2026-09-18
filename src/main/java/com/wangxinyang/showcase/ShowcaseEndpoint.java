package com.wangxinyang.showcase;

import static org.springframework.http.MediaType.APPLICATION_JSON;

import com.wangxinyang.showcase.extension.ShowcaseCategory;
import com.wangxinyang.showcase.extension.ShowcaseItem;
import com.wangxinyang.showcase.extension.ShowcaseSettings;
import com.wangxinyang.showcase.extension.ShowcaseSubcategory;
import com.wangxinyang.showcase.extension.ShowcaseTemplate;
import java.net.URI;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.Semaphore;
import java.util.function.Function;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.server.RequestPredicates;
import org.springframework.web.reactive.function.server.RouterFunction;
import org.springframework.web.reactive.function.server.RouterFunctions;
import org.springframework.web.reactive.function.server.ServerRequest;
import org.springframework.web.reactive.function.server.ServerResponse;
import reactor.core.publisher.Mono;
import reactor.core.publisher.Flux;
import reactor.core.scheduler.Schedulers;
import run.halo.app.core.extension.endpoint.CustomEndpoint;
import run.halo.app.core.extension.Plugin;
import run.halo.app.extension.GroupVersion;
import run.halo.app.extension.ConfigMap;
import run.halo.app.extension.Metadata;
import run.halo.app.extension.ReactiveExtensionClient;
import run.halo.app.infra.SystemSetting;

@Component
@RequiredArgsConstructor
public class ShowcaseEndpoint implements CustomEndpoint {
    private static final String SETTINGS_NAME = "showcase-settings";
    private static final String STEAM_PLUGIN_NAME = "steam";
    private static final String COMMENT_WIDGET_PLUGIN_NAME = "PluginCommentWidget";
    private static final String COMMENT_WIDGET_NEXT_PLUGIN_NAME = "PluginCommentNext";
    private static final String VISITOR_STATS_NAME = "showcase-visitor-stats";
    private static final String VISITOR_COOKIE = "showcase-visitor-id";
    private static final int PUBLIC_DEFAULT_LIMIT = 50;
    private static final int PUBLIC_MAX_LIMIT = 100;
    private static final int PUBLIC_MAX_OFFSET = 10_000;
    private static final long LIKE_WINDOW_MILLIS = 60_000L;
    private static final int LIKE_MAX_WRITES_PER_WINDOW = 300;
    // ConfigMap updates are serialized so concurrent requests cannot overwrite counters.
    // Semaphore release is safe even when the reactive chain resumes on another thread.
    private final Semaphore visitorStatsLock = new Semaphore(1);
    private final ConcurrentHashMap<String, Long> recentVisitorAt = new ConcurrentHashMap<>();
    private final AtomicLong visitorWindowStartedAt = new AtomicLong();
    private final AtomicInteger visitorWindowWrites = new AtomicInteger();
    private final Object likeRateLock = new Object();
    private final AtomicLong likeWindowStartedAt = new AtomicLong();
    private final AtomicInteger likeWindowWrites = new AtomicInteger();
    private final ReactiveExtensionClient client;

    @Override
    public RouterFunction<ServerResponse> endpoint() {
        return RouterFunctions.route()
            .GET("/public/v1/items", RequestPredicates.accept(APPLICATION_JSON), this::publicItems)
            .GET("/public/v1/categories", RequestPredicates.accept(APPLICATION_JSON), this::publicCategories)
            .GET("/public/v1/subcategories", RequestPredicates.accept(APPLICATION_JSON), this::publicSubcategories)
            .GET("/public/v1/catalog", RequestPredicates.accept(APPLICATION_JSON), this::publicCatalog)
            .GET("/public/v1/page", RequestPredicates.accept(APPLICATION_JSON), request -> publicPage())
            .GET("/public/v1/stats", RequestPredicates.accept(APPLICATION_JSON), request -> publicStats())
            .GET("/public/items", RequestPredicates.accept(APPLICATION_JSON), this::publicItems)
            .GET("/public/categories", RequestPredicates.accept(APPLICATION_JSON), this::publicCategories)
            .GET("/public/subcategories", RequestPredicates.accept(APPLICATION_JSON), this::publicSubcategories)
            .GET("/public/catalog", RequestPredicates.accept(APPLICATION_JSON), this::publicCatalog)
            .GET("/public/page", RequestPredicates.accept(APPLICATION_JSON), request -> publicPage())
            .GET("/public/stats", RequestPredicates.accept(APPLICATION_JSON), request -> publicStats())
            .GET("/items", RequestPredicates.accept(APPLICATION_JSON), request -> listItems(false))
            .GET("/categories", RequestPredicates.accept(APPLICATION_JSON), request -> listCategories(false))
            .GET("/subcategories", RequestPredicates.accept(APPLICATION_JSON), request -> listSubcategories(false))
            .GET("/settings", RequestPredicates.accept(APPLICATION_JSON), request -> getSettings())
            .GET("/stats", RequestPredicates.accept(APPLICATION_JSON), request -> readStats())
            .POST("/stats/visit", this::recordVisit)
            .GET("/admin/items", RequestPredicates.accept(APPLICATION_JSON), request -> listItems(true))
            .POST("/items", RequestPredicates.accept(APPLICATION_JSON), this::createItem)
            .POST("/items/like", this::likeItem)
            .PUT("/items/{name}", RequestPredicates.accept(APPLICATION_JSON), this::updateItem)
            .POST("/items/{name}/like", this::likeItem)
            .DELETE("/items/{name}", this::deleteItem)
            .GET("/admin/categories", RequestPredicates.accept(APPLICATION_JSON), request -> listCategories(true))
            .GET("/admin/subcategories", RequestPredicates.accept(APPLICATION_JSON), request -> listSubcategories(true))
            .GET("/admin/templates", RequestPredicates.accept(APPLICATION_JSON), request -> listTemplates())
            .POST("/templates", RequestPredicates.accept(APPLICATION_JSON), this::createTemplate)
            .PUT("/templates/{name}", RequestPredicates.accept(APPLICATION_JSON), this::updateTemplate)
            .DELETE("/templates/{name}", this::deleteTemplate)
            .POST("/templates/reset-defaults", this::resetDefaultTemplates)
            .POST("/categories", RequestPredicates.accept(APPLICATION_JSON), this::createCategory)
            .PUT("/categories/{name}", RequestPredicates.accept(APPLICATION_JSON), this::updateCategory)
            .DELETE("/categories/{name}", this::deleteCategory)
            .POST("/subcategories", RequestPredicates.accept(APPLICATION_JSON), this::createSubcategory)
            .PUT("/subcategories/{name}", RequestPredicates.accept(APPLICATION_JSON), this::updateSubcategory)
            .DELETE("/subcategories/{name}", this::deleteSubcategory)
            .PUT("/admin/settings", RequestPredicates.accept(APPLICATION_JSON), this::updateSettings)
            .build();
    }

    private Mono<ServerResponse> publicItems(ServerRequest request) {
        var offset = queryInt(request, "offset", 0, 0, PUBLIC_MAX_OFFSET);
        var limit = queryInt(request, "limit", PUBLIC_DEFAULT_LIMIT, 1, PUBLIC_MAX_LIMIT);
        return publicData().map(data -> filterPublicItems(data.items(), request))
            .map(items -> {
                var total = items.size();
                var from = Math.min(offset, total);
                var to = Math.min(from + limit, total);
                return new PublicItemPage(items.subList(from, to), offset, limit, total, to < total);
            })
            .flatMap(this::publicOk)
            .onErrorResume(this::publicErrorResponse);
    }

    private Mono<ServerResponse> publicCategories(ServerRequest request) {
        return publicData().map(PublicData::categories).flatMap(this::publicOk)
            .onErrorResume(this::publicErrorResponse);
    }

    private Mono<ServerResponse> publicSubcategories(ServerRequest request) {
        var category = query(request, "category", 120);
        return publicData().map(data -> data.subcategories().stream()
                .filter(item -> category.isBlank() || category.equals(item.category()))
                .toList())
            .flatMap(this::publicOk)
            .onErrorResume(this::publicErrorResponse);
    }

    private Mono<ServerResponse> publicCatalog(ServerRequest request) {
        var offset = queryInt(request, "offset", 0, 0, PUBLIC_MAX_OFFSET);
        var limit = queryInt(request, "limit", PUBLIC_DEFAULT_LIMIT, 1, PUBLIC_MAX_LIMIT);
        return publicData().map(data -> {
                var items = filterPublicItems(data.items(), request);
                var total = items.size();
                var from = Math.min(offset, total);
                var to = Math.min(from + limit, total);
                return new PublicCatalog("v1", data.categories(), data.subcategories(),
                    items.subList(from, to), data.templates(), offset, limit, total, to < total);
            })
            .flatMap(this::publicOk)
            .onErrorResume(this::publicErrorResponse);
    }

    private Mono<ServerResponse> publicPage() {
        var showcaseSettings = client.fetch(ShowcaseSettings.class, SETTINGS_NAME)
            .map(ShowcaseSettings::getSpec)
            .map(this::normalizeSettings)
            .defaultIfEmpty(ShowcaseSettings.defaults());
        var siteSettings = client.fetch(ConfigMap.class, SystemSetting.SYSTEM_CONFIG)
            .map(ConfigMap::getData)
            .flatMap(data -> Mono.justOrEmpty(SystemSetting.get(data,
                SystemSetting.Basic.GROUP, SystemSetting.Basic.class)))
            .defaultIfEmpty(new SystemSetting.Basic());
        var steamStatus = client.fetch(Plugin.class, STEAM_PLUGIN_NAME)
            .map(this::steamStatus)
            .defaultIfEmpty(SteamStatus.notInstalled());
        var commentStatus = client.fetch(Plugin.class, COMMENT_WIDGET_PLUGIN_NAME)
            .map(plugin -> commentWidgetStatus(plugin, "官方评论组件", COMMENT_WIDGET_PLUGIN_NAME))
            .defaultIfEmpty(CommentWidgetStatus.notInstalled("官方评论组件", COMMENT_WIDGET_PLUGIN_NAME));
        var commentNextStatus = client.fetch(Plugin.class, COMMENT_WIDGET_NEXT_PLUGIN_NAME)
            .map(plugin -> commentWidgetStatus(plugin, "评论组件 Next", COMMENT_WIDGET_NEXT_PLUGIN_NAME))
            .defaultIfEmpty(CommentWidgetStatus.notInstalled("评论组件 Next", COMMENT_WIDGET_NEXT_PLUGIN_NAME));
        return Mono.zip(showcaseSettings, siteSettings, steamStatus, commentStatus, commentNextStatus)
            .map(tuple -> publicSettings(tuple.getT1(), tuple.getT2(), tuple.getT3(), tuple.getT4(), tuple.getT5()))
            .map(this::toPublicPage)
            .flatMap(this::publicOk)
            .onErrorResume(this::publicErrorResponse);
    }

    private Mono<ServerResponse> publicStats() {
        return visitorStatsEnabled().flatMap(enabled -> enabled
                ? client.fetch(ConfigMap.class, VISITOR_STATS_NAME)
                    .map(config -> publicStats(true, config.getData()))
                    .defaultIfEmpty(publicStats(true, Map.of()))
                : Mono.just(publicStats(false, Map.of())))
            .flatMap(this::publicOk)
            .onErrorResume(this::publicErrorResponse);
    }

    private PublicStats publicStats(boolean enabled, Map<String, String> data) {
        var counters = statsPayload(data);
        return new PublicStats(enabled, counters.get("todayVisitors"), counters.get("todayVisits"),
            counters.get("totalVisitors"), counters.get("totalVisits"));
    }

    private PublicPage toPublicPage(PublicSettings settings) {
        return new PublicPage(settings.pageTitle(), settings.subtitle(), settings.ownerText(),
            settings.themeColor(), settings.effectEnabled(), settings.effectType(),
            settings.commentEnabled(), settings.detailCommentEnabled(), settings.commentType(),
            settings.twikooEnvId(), settings.twikooJsUrl(), settings.commentAnonymousEmail(),
            settings.steamEnabled() && settings.steamActive(), settings.heroGifEnabled(),
            publicMediaUrl(settings.heroGifUrl()), settings.visitorStatsEnabled(),
            settings.heroBackgroundEnabled(), settings.heroBackgroundType(),
            publicMediaUrl(settings.heroBackgroundUrl()), settings.heroBackgroundOpacity(),
            settings.heroBackgroundSaturation(), settings.contentBackgroundEnabled(),
            settings.contentBackgroundType(), publicMediaUrl(settings.contentBackgroundUrl()),
            settings.contentBackgroundOpacity(), settings.contentBackgroundSaturation(),
            settings.signatureEnabled(), settings.signatureText(), settings.siteName(),
            publicMediaUrl(settings.siteLogo()), publicMediaUrl(settings.siteFavicon()));
    }

    private Mono<PublicData> publicData() {
        var categories = client.list(ShowcaseCategory.class,
                category -> category.getSpec() != null
                    && Boolean.TRUE.equals(category.getSpec().getVisible()),
                Comparator.comparingInt(category -> safeInt(category.getSpec() == null
                    ? null : category.getSpec().getPriority())))
            .collectList();
        var subcategories = client.list(ShowcaseSubcategory.class,
                subcategory -> subcategory.getSpec() != null
                    && Boolean.TRUE.equals(subcategory.getSpec().getVisible()),
                Comparator.comparingInt(subcategory -> safeInt(subcategory.getSpec() == null
                    ? null : subcategory.getSpec().getPriority())))
            .collectList();
        var items = client.list(ShowcaseItem.class,
                item -> item.getSpec() != null
                    && Boolean.TRUE.equals(item.getSpec().getPublished()),
                Comparator.comparingInt(item -> safeInt(item.getSpec() == null
                    ? null : item.getSpec().getPriority())))
            .collectList();
        var templates = client.list(ShowcaseTemplate.class,
                template -> true,
                Comparator.comparing(template -> {
                    var spec = template.getSpec();
                    return spec == null ? "" : spec.getDisplayName();
                }))
            .collectList();
        return Mono.zip(categories, subcategories, items, templates).map(tuple -> {
            var visibleCategories = tuple.getT1();
            var categoryNames = visibleCategories.stream()
                .map(category -> category.getMetadata() == null ? null : category.getMetadata().getName())
                .filter(java.util.Objects::nonNull)
                .collect(java.util.stream.Collectors.toSet());
            var visibleSubcategories = tuple.getT2().stream()
                .filter(subcategory -> subcategory.getMetadata() != null
                    && subcategory.getMetadata().getName() != null
                    && categoryNames.contains(subcategory.getSpec().getCategory()))
                .toList();
            var subcategoryCategories = visibleSubcategories.stream().collect(
                java.util.stream.Collectors.toMap(subcategory -> subcategory.getMetadata().getName(),
                    subcategory -> subcategory.getSpec().getCategory(), (left, right) -> left));
            var publicItems = tuple.getT3().stream()
                .filter(item -> item.getMetadata() != null && item.getMetadata().getName() != null)
                .filter(item -> categoryNames.contains(item.getSpec().getCategory()))
                .filter(item -> item.getSpec().getSubcategory() == null
                    || item.getSpec().getSubcategory().isBlank()
                    || item.getSpec().getCategory().equals(
                        subcategoryCategories.get(item.getSpec().getSubcategory())))
                .map(this::toPublicItem)
                .toList();
            // Repair any category whose templateFields were downgraded by an older
            // validator (e.g. tags/image coerced to text). The canonical types
            // come from the latest template definition so the public API always
            // reflects what the editor is rendering, even before the category is
            // re-saved.
            var templateByName = tuple.getT4().stream()
                .filter(t -> t.getMetadata() != null && t.getMetadata().getName() != null)
                .collect(java.util.stream.Collectors.toMap(
                    t -> t.getMetadata().getName(),
                    t -> t,
                    (left, right) -> left));
            visibleCategories.forEach(category -> {
                applyTemplateFieldTypes(category, templateByName);
                ensureCoverTagsField(category, templateByName);
            });
            return new PublicData(
                visibleCategories.stream().map(this::toPublicCategory).toList(),
                visibleSubcategories.stream().map(this::toPublicSubcategory).toList(),
                publicItems,
                tuple.getT4().stream().map(this::toPublicTemplate).toList());
        });
    }

    /**
     * Walk the linked template's fields and overwrite the matching
     * {@code templateFields} entries on the supplied category with the
     * canonical type so the public API matches the template the editor is
     * using. Other metadata (label, help, required, etc.) on the user's
     * category is preserved.
     */
    private void applyTemplateFieldTypes(ShowcaseCategory category,
            java.util.Map<String, ShowcaseTemplate> templateByName) {
        var spec = category.getSpec();
        if (spec == null) return;
        var templateName = spec.getTemplate();
        if (templateName == null || templateName.isBlank()) return;
        var template = templateByName.get(templateName);
        if (template == null || template.getSpec() == null || template.getSpec().getFields() == null) return;
        var byKey = new java.util.HashMap<String, String>();
        for (var field : template.getSpec().getFields()) {
            if (field != null && field.getKey() != null && !field.getKey().isBlank()
                && field.getType() != null && !field.getType().isBlank()) {
                byKey.put(field.getKey(), field.getType());
            }
        }
        if (byKey.isEmpty()) return;
        if (spec.getTemplateFields() == null) return;
        for (var field : spec.getTemplateFields()) {
            if (field == null || field.getKey() == null) continue;
            var canonical = byKey.get(field.getKey());
            if (canonical != null) field.setType(canonical);
        }
    }

    private void ensureCoverTagsField(ShowcaseCategory category,
            java.util.Map<String, ShowcaseTemplate> templateByName) {
        var spec = category.getSpec();
        if (spec == null) return;
        if (spec.getTemplateFields() == null) spec.setTemplateFields(new ArrayList<>());
        var hasCoverTags = spec.getTemplateFields().stream().anyMatch(field ->
            field != null && ("tags".equals(field.getKey()) || "tags".equals(field.getType())
                || "封面标签".equals(field.getLabel())));
        if (hasCoverTags) return;
        ShowcaseCategory.TemplateField source = null;
        var templateName = spec.getTemplate();
        if (templateName != null && !templateName.isBlank()) {
            var template = templateByName.get(templateName);
            if (template != null && template.getSpec() != null && template.getSpec().getFields() != null) {
                source = template.getSpec().getFields().stream()
                    .filter(field -> field != null && ("tags".equals(field.getKey()) || "tags".equals(field.getType())
                        || "封面标签".equals(field.getLabel())))
                    .findFirst().orElse(null);
            }
        }
        var field = new ShowcaseCategory.TemplateField();
        field.setKey(source != null && source.getKey() != null && !source.getKey().isBlank() ? source.getKey() : "tags");
        field.setLabel(source != null && source.getLabel() != null && !source.getLabel().isBlank() ? source.getLabel() : "封面标签");
        field.setType("tags");
        field.setRequired(false);
        field.setShowInCard(true);
        field.setPlaceholder(source != null ? source.getPlaceholder() : "例如：治愈、校园、恋爱");
        field.setHelpText(source != null ? source.getHelpText() : "多个标签用逗号分隔，最多显示 6 个；卡片左下角展示");
        spec.getTemplateFields().add(field);
    }

    private PublicTemplate toPublicTemplate(ShowcaseTemplate template) {
        var spec = template.getSpec();
        return new PublicTemplate(template.getMetadata().getName(),
            trim(spec == null ? null : spec.getDisplayName(), 50),
            trim(spec == null ? null : spec.getDescription(), 200),
            trim(spec == null ? null : spec.getIcon(), 12),
            spec == null || spec.getFields() == null ? List.of() : spec.getFields());
    }

    private PublicItem toPublicItem(ShowcaseItem item) {
        var spec = item.getSpec();
        return new PublicItem(item.getMetadata().getName(), trim(spec.getTitle(), 120),
            trim(spec.getCategory(), 120), trim(spec.getSubcategory(), 120),
            publicMediaUrl(spec.getCover()), trim(spec.getDescription(), 3000),
            trim(spec.getImpression(), 5000), publicHttpUrl(spec.getWatchUrl()),
            publicHttpUrl(spec.getExternalUrl()), normalizeTags(spec.getTags()), trim(spec.getStatus(), 30),
            normalizeScore(spec.getScore()), safeLikes(spec.getLikes()), safeInt(spec.getPriority()),
            trim(spec.getTemplate(), 120), spec.getCustomFields());
    }

    private PublicCategory toPublicCategory(ShowcaseCategory category) {
        var spec = category.getSpec();
        return new PublicCategory(category.getMetadata().getName(), trim(spec.getDisplayName(), 50),
            trim(spec.getDescription(), 200), trim(spec.getIcon(), 12), safeInt(spec.getPriority()), spec.getTemplate(), spec.getTemplateFields());
    }

    private PublicSubcategory toPublicSubcategory(ShowcaseSubcategory subcategory) {
        var spec = subcategory.getSpec();
        return new PublicSubcategory(subcategory.getMetadata().getName(), trim(spec.getCategory(), 120),
            trim(spec.getDisplayName(), 80), trim(spec.getDescription(), 300),
            trim(spec.getIcon(), 12), safeInt(spec.getPriority()));
    }

    private String publicItemText(PublicItem item) {
        return String.join(" ", item.title(), item.description(), item.impression(), item.status(),
            String.join(" ", item.tags()), String.join(" ", item.customFields().values())).toLowerCase(Locale.ROOT);
    }

    private List<PublicItem> filterPublicItems(List<PublicItem> items, ServerRequest request) {
        var category = query(request, "category", 120);
        var subcategory = query(request, "subcategory", 120);
        var keyword = query(request, "keyword", 100).toLowerCase(Locale.ROOT);
        return items.stream()
            .filter(item -> category.isBlank() || category.equals(item.category()))
            .filter(item -> subcategory.isBlank() || subcategory.equals(item.subcategory()))
            .filter(item -> keyword.isBlank() || publicItemText(item).contains(keyword))
            .toList();
    }

    private String query(ServerRequest request, String name, int maxLength) {
        return trim(request.queryParam(name).orElse(""), maxLength);
    }

    private int queryInt(ServerRequest request, String name, int fallback, int min, int max) {
        try {
            return Math.max(min, Math.min(max,
                Integer.parseInt(request.queryParam(name).orElse(Integer.toString(fallback)))));
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private Mono<ServerResponse> publicOk(Object body) {
        return ServerResponse.ok().contentType(APPLICATION_JSON)
            .header("X-Content-Type-Options", "nosniff")
            .cacheControl(CacheControl.maxAge(Duration.ofSeconds(30)).cachePublic())
            .bodyValue(body);
    }

    private record PublicData(List<PublicCategory> categories,
                              List<PublicSubcategory> subcategories,
                              List<PublicItem> items,
                              List<PublicTemplate> templates) {
    }

    private record PublicCatalog(String apiVersion, List<PublicCategory> categories,
                                 List<PublicSubcategory> subcategories,
                                 List<PublicItem> items, List<PublicTemplate> templates,
                                 int offset, int limit,
                                 int total, boolean hasMore) {
    }

    private record PublicItemPage(List<PublicItem> items, int offset, int limit,
                                  int total, boolean hasMore) {
    }

    private record PublicCategory(String id, String title, String description,
                                  String icon, int priority, String template,
                                  List<ShowcaseCategory.TemplateField> templateFields) {
    }

    private record PublicTemplate(String id, String displayName, String description,
                                    String icon, List<ShowcaseCategory.TemplateField> fields) {
    }

    private record PublicSubcategory(String id, String category, String title,
                                     String description, String icon, int priority) {
    }

    private record PublicItem(String id, String title, String category, String subcategory,
                              String cover, String description, String impression,
                              String watchUrl, String externalUrl, List<String> tags,
                                  String status, BigDecimal score, int likes, int priority, String template, Map<String, String> customFields) {
    }

    private record PublicPage(String pageTitle, String subtitle, String ownerText,
                              String themeColor, Boolean effectEnabled, String effectType,
                              Boolean commentEnabled, Boolean detailCommentEnabled, String commentType,
                              String twikooEnvId, String twikooJsUrl, Boolean commentAnonymousEmail,
                              Boolean steamEnabled, Boolean heroGifEnabled, String heroGifUrl,
                              Boolean visitorStatsEnabled, Boolean heroBackgroundEnabled,
                              String heroBackgroundType, String heroBackgroundUrl,
                              Integer heroBackgroundOpacity, Integer heroBackgroundSaturation,
                              Boolean contentBackgroundEnabled, String contentBackgroundType,
                              String contentBackgroundUrl, Integer contentBackgroundOpacity,
                              Integer contentBackgroundSaturation, Boolean signatureEnabled,
                              String signatureText, String siteName, String siteLogo,
                              String siteFavicon) {
    }

    private record PublicStats(boolean enabled, int todayVisitors, int todayVisits,
                               int totalVisitors, int totalVisits) {
    }

    private Mono<ServerResponse> listItems(boolean includeUnpublished) {
        return client.list(ShowcaseItem.class,
                item -> includeUnpublished || Boolean.TRUE.equals(item.getSpec().getPublished()),
                Comparator.comparingInt(item -> safeInt(item.getSpec().getPriority())))
            .collectList()
            .flatMap(this::ok);
    }

    private Mono<ServerResponse> listCategories(boolean includeHidden) {
        return client.list(ShowcaseCategory.class,
                category -> includeHidden || Boolean.TRUE.equals(category.getSpec().getVisible()),
                Comparator.comparingInt(category -> safeInt(category.getSpec().getPriority())))
            .collectList()
            .map(categories -> {
                if (categories.isEmpty()) {
                    categories.add(defaultAnimeCategory());
                }
                return categories;
            })
            .flatMap(this::ok);
    }

    private Mono<ServerResponse> listSubcategories(boolean includeHidden) {
        return client.list(ShowcaseSubcategory.class,
                subcategory -> includeHidden || Boolean.TRUE.equals(subcategory.getSpec().getVisible()),
                Comparator.comparingInt(subcategory -> safeInt(subcategory.getSpec().getPriority())))
            .collectList().flatMap(this::ok);
    }

    private Mono<ServerResponse> listTemplates() {
        return client.list(ShowcaseTemplate.class, template -> true,
                Comparator.comparing(template -> template.getSpec().getDisplayName()))
            .collectList().flatMap(this::ok);
    }

    private Mono<ServerResponse> createTemplate(ServerRequest request) {
        return request.bodyToMono(ShowcaseTemplate.TemplateSpec.class).map(this::normalizeTemplate)
            .map(spec -> { var template = new ShowcaseTemplate(); template.setMetadata(metadata("showcase-template-")); template.setSpec(spec); return template; })
            .flatMap(client::create).flatMap(this::created).onErrorResume(this::errorResponse);
    }

    private Mono<ServerResponse> updateTemplate(ServerRequest request) {
        return request.bodyToMono(ShowcaseTemplate.TemplateSpec.class).map(this::normalizeTemplate)
            .zipWith(client.get(ShowcaseTemplate.class, request.pathVariable("name")))
            .map(tuple -> { tuple.getT2().setSpec(tuple.getT1()); return tuple.getT2(); })
            .flatMap(client::update).flatMap(this::ok).onErrorResume(this::errorResponse);
    }

    private Mono<ServerResponse> deleteTemplate(ServerRequest request) {
        var name = request.pathVariable("name");
        return client.list(ShowcaseCategory.class,
                category -> name.equals(category.getSpec().getTemplate()),
                Comparator.comparing(category -> category.getMetadata().getName()))
            .collectList()
            .flatMap(usedBy -> {
                if (usedBy.isEmpty()) {
                    return client.get(ShowcaseTemplate.class, name)
                        .flatMap(client::delete)
                        .then(ServerResponse.noContent().build());
                }
                var names = usedBy.stream()
                    .map(c -> c.getSpec().getDisplayName())
                    .collect(java.util.stream.Collectors.joining("、"));
                return badRequest(String.format(
                    "该模板仍被以下分类使用：%s。请先将这些分类的「内容模板」切换为其他模板，或解除关联后再删除。",
                    names));
            })
            .onErrorResume(this::errorResponse);
    }

    private Mono<ServerResponse> resetDefaultTemplates(ServerRequest request) {
        // Re-seed built-in templates. For each preset, fetch the existing extension
        // by its stable metadata.name and overwrite its spec with the latest
        // defaults so renamed display names / icons / added fields propagate when
        // users upgrade the plugin. If a preset is missing entirely we create it.
        // Custom user-defined templates are never touched.
        var presets = PluginPresets.builtInTemplates();
        return Flux.fromIterable(presets)
            .flatMap(preset -> client.fetch(ShowcaseTemplate.class, preset.name())
                .flatMap(existing -> {
                    // Preserve metadata (labels / annotations / version) but
                    // overwrite the spec so displayName / icon / description /
                    // fields track the latest preset definitions.
                    existing.setSpec(preset.template().getSpec());
                    return client.update(existing);
                })
                .switchIfEmpty(Mono.defer(() -> client.create(preset.template()))))
            .then(ServerResponse.ok().build())
            .onErrorResume(this::errorResponse);
    }

    private Mono<ServerResponse> getSettings() {
        var showcaseSettings = client.fetch(ShowcaseSettings.class, SETTINGS_NAME)
            .map(ShowcaseSettings::getSpec)
            .map(this::normalizeSettings)
            .defaultIfEmpty(ShowcaseSettings.defaults());
        var siteSettings = client.fetch(ConfigMap.class, SystemSetting.SYSTEM_CONFIG)
            .map(ConfigMap::getData)
            .flatMap(data -> Mono.justOrEmpty(SystemSetting.get(data,
                SystemSetting.Basic.GROUP, SystemSetting.Basic.class)))
            .defaultIfEmpty(new SystemSetting.Basic());
        var steamStatus = client.fetch(Plugin.class, STEAM_PLUGIN_NAME)
            .map(this::steamStatus)
            .defaultIfEmpty(SteamStatus.notInstalled());
        var commentWidgetStatus = client.fetch(Plugin.class, COMMENT_WIDGET_PLUGIN_NAME)
            .map(plugin -> commentWidgetStatus(plugin, "官方评论组件", COMMENT_WIDGET_PLUGIN_NAME))
            .defaultIfEmpty(CommentWidgetStatus.notInstalled("官方评论组件", COMMENT_WIDGET_PLUGIN_NAME));
        var commentWidgetNextStatus = client.fetch(Plugin.class, COMMENT_WIDGET_NEXT_PLUGIN_NAME)
            .map(plugin -> commentWidgetStatus(plugin, "评论组件 Next", COMMENT_WIDGET_NEXT_PLUGIN_NAME))
            .defaultIfEmpty(CommentWidgetStatus.notInstalled("评论组件 Next", COMMENT_WIDGET_NEXT_PLUGIN_NAME));
        return Mono.zip(showcaseSettings, siteSettings, steamStatus, commentWidgetStatus, commentWidgetNextStatus)
            .map(tuple -> publicSettings(tuple.getT1(), tuple.getT2(), tuple.getT3(), tuple.getT4(), tuple.getT5()))
            .flatMap(this::ok);
    }

    private PublicSettings publicSettings(ShowcaseSettings.SettingsSpec showcase,
        SystemSetting.Basic site, SteamStatus steamStatus,
        CommentWidgetStatus commentWidgetStatus, CommentWidgetStatus commentWidgetNextStatus) {
        var siteName = orDefault(trim(site.getTitle(), 120), "我的博客");
        // Keep the navigation logo and browser favicon independent. The navigation
        // follows Halo's site Logo setting, while the document icon follows Favicon.
        var siteLogo = trim(site.getLogo(), 2000);
        var siteFavicon = trim(site.getFavicon(), 2000);
        return new PublicSettings(showcase.getPageTitle(), showcase.getSubtitle(),
            showcase.getOwnerText(), showcase.getThemeColor(), showcase.getEffectEnabled(),
            showcase.getEffectType(), showcase.getCommentEnabled(), showcase.getDetailCommentEnabled(),
            showcase.getCommentType(),
            showcase.getTwikooEnvId(), showcase.getTwikooJsUrl(), showcase.getCommentAnonymousEmail(), showcase.getSteamEnabled(),
            steamStatus.installed(), steamStatus.active(), steamStatus.message(),
            showcase.getHeroGifEnabled(), showcase.getHeroGifUrl(),
            showcase.getVisitorStatsEnabled(),
            showcase.getHeroBackgroundEnabled(), showcase.getHeroBackgroundType(),
            showcase.getHeroBackgroundUrl(), showcase.getHeroBackgroundOpacity(),
            showcase.getHeroBackgroundSaturation(), showcase.getContentBackgroundEnabled(),
            showcase.getContentBackgroundType(), showcase.getContentBackgroundUrl(),
            showcase.getContentBackgroundOpacity(), showcase.getContentBackgroundSaturation(),
            showcase.getSignatureEnabled(), showcase.getSignatureText(),
            siteName, siteLogo, siteFavicon,
            commentWidgetStatus.installed(), commentWidgetStatus.active(), commentWidgetStatus.message(),
            commentWidgetNextStatus.installed(), commentWidgetNextStatus.active(), commentWidgetNextStatus.message());
    }

    private record PublicSettings(String pageTitle, String subtitle, String ownerText,
                                  String themeColor, Boolean effectEnabled, String effectType,
                                  Boolean commentEnabled, Boolean detailCommentEnabled, String commentType,
                                  String twikooEnvId, String twikooJsUrl, Boolean commentAnonymousEmail, Boolean steamEnabled,
                                  Boolean steamInstalled, Boolean steamActive,
                                  String steamMessage, Boolean heroGifEnabled, String heroGifUrl,
                                  Boolean visitorStatsEnabled,
                                  Boolean heroBackgroundEnabled, String heroBackgroundType,
                                  String heroBackgroundUrl, Integer heroBackgroundOpacity,
                                  Integer heroBackgroundSaturation, Boolean contentBackgroundEnabled,
                                  String contentBackgroundType, String contentBackgroundUrl,
                                  Integer contentBackgroundOpacity, Integer contentBackgroundSaturation,
                                  Boolean signatureEnabled, String signatureText, String siteName,
                                  String siteLogo, String siteFavicon,
                                  Boolean commentWidgetInstalled, Boolean commentWidgetActive,
                                  String commentWidgetMessage,
                                  Boolean commentWidgetNextInstalled, Boolean commentWidgetNextActive,
                                  String commentWidgetNextMessage) {
    }

    private SteamStatus steamStatus(Plugin plugin) {
        var enabled = plugin.getSpec() != null && Boolean.TRUE.equals(plugin.getSpec().getEnabled());
        var phase = plugin.getStatus() == null ? null : plugin.getStatus().getPhase();
        var active = enabled && Plugin.Phase.STARTED.equals(phase);
        if (!enabled) {
            return new SteamStatus(true, false, "Steam 信息展示插件已安装，但尚未启用");
        }
        if (!active) {
            var phaseText = phase == null ? "未知" : phase.name();
            return new SteamStatus(true, false,
                "Steam 信息展示插件尚未正常运行（当前状态：" + phaseText + "）");
        }
        return new SteamStatus(true, true, "Steam 信息展示插件已安装并正常运行");
    }

    private record SteamStatus(boolean installed, boolean active, String message) {
        private static SteamStatus notInstalled() {
            return new SteamStatus(false, false, "尚未安装 Steam 信息展示插件");
        }
    }

    private CommentWidgetStatus commentWidgetStatus(Plugin plugin, String displayName, String pluginName) {
        var enabled = plugin.getSpec() != null && Boolean.TRUE.equals(plugin.getSpec().getEnabled());
        var phase = plugin.getStatus() == null ? null : plugin.getStatus().getPhase();
        var active = enabled && Plugin.Phase.STARTED.equals(phase);
        if (!enabled) {
            return new CommentWidgetStatus(true, false, displayName + "插件已安装，但尚未启用");
        }
        if (!active) {
            var phaseText = phase == null ? "未知" : phase.name();
            return new CommentWidgetStatus(true, false,
                displayName + "插件尚未正常运行（当前状态：" + phaseText + "）");
        }
        return new CommentWidgetStatus(true, true, displayName + "插件已安装并正常运行");
    }

    private record CommentWidgetStatus(boolean installed, boolean active, String message) {
        private static CommentWidgetStatus notInstalled(String displayName, String pluginName) {
            return new CommentWidgetStatus(false, false, "尚未安装 " + displayName + " 插件（" + pluginName + "）");
        }
    }

    private Mono<ServerResponse> createItem(ServerRequest request) {
        return request.bodyToMono(ShowcaseItem.ItemSpec.class)
            .flatMap(this::validateItem)
            .map(spec -> {
                var item = new ShowcaseItem();
                item.setMetadata(metadata("showcase-item-"));
                item.setSpec(spec);
                return item;
            })
            .flatMap(client::create)
            .flatMap(this::created)
            .onErrorResume(this::errorResponse);
    }

    private Mono<ServerResponse> updateItem(ServerRequest request) {
        var name = request.pathVariable("name");
        return request.bodyToMono(ShowcaseItem.ItemSpec.class)
            .flatMap(this::validateItem)
            .zipWith(client.get(ShowcaseItem.class, name))
            .map(tuple -> {
                var item = tuple.getT2();
                item.setSpec(tuple.getT1());
                return item;
            })
            .flatMap(client::update)
            .flatMap(this::ok)
            .onErrorResume(this::errorResponse);
    }

    private Mono<ServerResponse> likeItem(ServerRequest request) {
        var itemName = request.pathVariables().get("name");
        if (itemName == null || itemName.isBlank()) {
            itemName = request.queryParam("name").orElse("");
        }
        itemName = trim(itemName, 120);
        if (itemName.isBlank()) return badRequest("缺少展示内容名称");
        var publicItemName = itemName;
        if (!allowLike()) return tooManyRequests();
        return publicData()
            .flatMap(data -> data.items().stream().anyMatch(item -> publicItemName.equals(item.id()))
                ? client.get(ShowcaseItem.class, publicItemName)
                : Mono.error(new IllegalArgumentException("展示内容不存在")))
            .map(item -> {
                var spec = item.getSpec();
                var currentLikes = safeLikes(spec.getLikes());
                spec.setLikes(currentLikes == Integer.MAX_VALUE ? currentLikes : currentLikes + 1);
                return item;
            })
            .flatMap(client::update)
            .flatMap(item -> ok(Map.of("likes", safeLikes(item.getSpec().getLikes()))))
            .onErrorResume(this::errorResponse);
    }

    private boolean allowLike() {
        var now = System.currentTimeMillis();
        synchronized (likeRateLock) {
            var started = likeWindowStartedAt.get();
            if (started == 0L || now - started >= LIKE_WINDOW_MILLIS) {
                likeWindowStartedAt.set(now);
                likeWindowWrites.set(0);
            }
            if (likeWindowWrites.incrementAndGet() > LIKE_MAX_WRITES_PER_WINDOW) return false;
            return true;
        }
    }

    private Mono<ServerResponse> deleteItem(ServerRequest request) {
        return client.get(ShowcaseItem.class, request.pathVariable("name"))
            .flatMap(client::delete)
            .then(ServerResponse.noContent().build())
            .onErrorResume(this::errorResponse);
    }

    private Mono<ServerResponse> createCategory(ServerRequest request) {
        return request.bodyToMono(ShowcaseCategory.CategorySpec.class)
            .flatMap(this::validateCategory)
            .flatMap(this::syncTemplateFieldsFromTemplate)
            .map(spec -> {
                var category = new ShowcaseCategory();
                category.setMetadata(metadata("showcase-category-"));
                category.setSpec(spec);
                return category;
            })
            .flatMap(client::create)
            .flatMap(category -> rebalanceCategory(category, category.getSpec().getPriority()))
            .flatMap(this::created)
            .onErrorResume(this::errorResponse);
    }

    private Mono<ServerResponse> updateCategory(ServerRequest request) {
        var name = request.pathVariable("name");
        return request.bodyToMono(ShowcaseCategory.CategorySpec.class)
            .flatMap(this::validateCategory)
            .flatMap(this::syncTemplateFieldsFromTemplate)
            .zipWith(client.get(ShowcaseCategory.class, name))
            .map(tuple -> {
                var category = tuple.getT2();
                category.setSpec(tuple.getT1());
                return category;
            })
            .flatMap(category -> rebalanceCategory(category, category.getSpec().getPriority()))
            .flatMap(this::ok)
            .onErrorResume(this::errorResponse);
    }

    private Mono<ServerResponse> deleteCategory(ServerRequest request) {
        var name = request.pathVariable("name");
        return client.list(ShowcaseItem.class,
                item -> name.equals(item.getSpec().getCategory()), Comparator.comparing(item -> item.getMetadata().getName()))
            .hasElements()
            .flatMap(hasItems -> hasItems
                ? badRequest("该分类下仍有展示项目，请先移动或删除这些项目")
                : client.list(ShowcaseSubcategory.class,
                    subcategory -> name.equals(subcategory.getSpec().getCategory()),
                    Comparator.comparing(subcategory -> subcategory.getMetadata().getName()))
                    .hasElements()
                    .flatMap(hasSubcategories -> hasSubcategories
                        ? badRequest("分类下仍有二级标题，请先删除这些二级标题")
                        : client.get(ShowcaseCategory.class, name)
                            .flatMap(client::delete)
                            .then(ServerResponse.noContent().build())))
            .onErrorResume(this::errorResponse);
    }

    private Mono<ServerResponse> createSubcategory(ServerRequest request) {
        return request.bodyToMono(ShowcaseSubcategory.SubcategorySpec.class)
            .flatMap(this::validateSubcategory)
            .map(spec -> {
                var subcategory = new ShowcaseSubcategory();
                subcategory.setMetadata(metadata("showcase-subcategory-"));
                subcategory.setSpec(spec);
                return subcategory;
            })
            .flatMap(client::create)
            .flatMap(subcategory -> rebalanceSubcategory(subcategory,
                subcategory.getSpec().getCategory(), subcategory.getSpec().getPriority()))
            .flatMap(this::created)
            .onErrorResume(this::errorResponse);
    }

    private Mono<ServerResponse> updateSubcategory(ServerRequest request) {
        var name = request.pathVariable("name");
        return request.bodyToMono(ShowcaseSubcategory.SubcategorySpec.class)
            .flatMap(this::validateSubcategory)
            .zipWith(client.get(ShowcaseSubcategory.class, name))
            .map(tuple -> { var item = tuple.getT2(); item.setSpec(tuple.getT1()); return item; })
            .flatMap(item -> rebalanceSubcategory(item, item.getSpec().getCategory(), item.getSpec().getPriority()))
            .flatMap(this::ok)
            .onErrorResume(this::errorResponse);
    }

    private Mono<ServerResponse> deleteSubcategory(ServerRequest request) {
        var name = request.pathVariable("name");
        return client.list(ShowcaseItem.class,
                item -> name.equals(item.getSpec().getSubcategory()),
                Comparator.comparing(item -> item.getMetadata().getName()))
            .hasElements()
            .flatMap(hasItems -> hasItems
                ? badRequest("该二级标题下仍有展示内容，请先移动或删除这些内容")
                : client.get(ShowcaseSubcategory.class, name).flatMap(client::delete)
                    .then(ServerResponse.noContent().build()))
            .onErrorResume(this::errorResponse);
    }

    private Mono<ShowcaseCategory> rebalanceCategory(ShowcaseCategory selected,
        Integer requestedPriority) {
        var selectedName = selected.getMetadata().getName();
        return client.list(ShowcaseCategory.class,
                category -> !selectedName.equals(category.getMetadata().getName()),
                Comparator.<ShowcaseCategory>comparingInt(category -> safeInt(category.getSpec().getPriority()))
                    .thenComparing(category -> category.getMetadata().getCreationTimestamp(),
                        Comparator.nullsLast(Comparator.naturalOrder()))
                    .thenComparing(category -> category.getMetadata().getName()))
            .collectList()
            .flatMap(categories -> {
                var position = Math.max(1,
                    Math.min(Math.max(1, safeInt(requestedPriority)), categories.size() + 1)) - 1;
                categories.add(position, selected);
                return persistCategoryOrder(categories, selectedName).thenReturn(selected);
            });
    }

    private Mono<Void> persistCategoryOrder(List<ShowcaseCategory> categories,
        String selectedName) {
        return Flux.range(0, categories.size())
            .concatMap(index -> {
                var category = categories.get(index);
                var priority = index + 1;
                if (safeInt(category.getSpec().getPriority()) == priority
                    && !selectedName.equals(category.getMetadata().getName())) {
                    return Mono.empty();
                }
                category.getSpec().setPriority(priority);
                return category.getMetadata().getVersion() == null
                    ? client.create(category) : client.update(category);
            })
            .then();
    }

    private Mono<ShowcaseSubcategory> rebalanceSubcategory(ShowcaseSubcategory selected,
        String categoryName, Integer requestedPriority) {
        var selectedName = selected.getMetadata().getName();
        return client.list(ShowcaseSubcategory.class,
                subcategory -> categoryName.equals(subcategory.getSpec().getCategory())
                    && !selectedName.equals(subcategory.getMetadata().getName()),
                Comparator.<ShowcaseSubcategory>comparingInt(subcategory -> safeInt(subcategory.getSpec().getPriority()))
                    .thenComparing(subcategory -> subcategory.getMetadata().getCreationTimestamp(),
                        Comparator.nullsLast(Comparator.naturalOrder()))
                    .thenComparing(subcategory -> subcategory.getMetadata().getName()))
            .collectList()
            .flatMap(subcategories -> {
                var position = Math.max(1,
                    Math.min(Math.max(1, safeInt(requestedPriority)), subcategories.size() + 1)) - 1;
                subcategories.add(position, selected);
                return persistSubcategoryOrder(subcategories, selectedName).thenReturn(selected);
            });
    }

    private Mono<Void> persistSubcategoryOrder(List<ShowcaseSubcategory> subcategories,
        String selectedName) {
        return Flux.range(0, subcategories.size())
            .concatMap(index -> {
                var subcategory = subcategories.get(index);
                var priority = index + 1;
                if (safeInt(subcategory.getSpec().getPriority()) == priority
                    && !selectedName.equals(subcategory.getMetadata().getName())) {
                    return Mono.empty();
                }
                subcategory.getSpec().setPriority(priority);
                return subcategory.getMetadata().getVersion() == null
                    ? client.create(subcategory) : client.update(subcategory);
            })
            .then();
    }

    private Mono<ServerResponse> readStats() {
        return visitorStatsEnabled()
            .flatMap(enabled -> enabled
                ? client.fetch(ConfigMap.class, VISITOR_STATS_NAME)
                    .map(config -> statsPayload(config.getData()))
                    .defaultIfEmpty(statsPayload(Map.of()))
                    .flatMap(this::ok)
                : ok(statsPayload(Map.of())));
    }

    private Mono<ServerResponse> recordVisit(ServerRequest request) {
        return visitorStatsEnabled().flatMap(enabled -> {
            if (!enabled) {
                return ok(statsPayload(Map.of()));
            }
            var cookie = request.cookies().getFirst(VISITOR_COOKIE);
            var visitorId = VisitorStatsSupport.validOrNewUuid(cookie == null ? null : cookie.getValue());
            var visitorHash = VisitorStatsSupport.hashVisitorId(visitorId);
            return Mono.fromCallable(() -> {
                    visitorStatsLock.acquireUninterruptibly();
                    return true;
                })
                .subscribeOn(Schedulers.boundedElastic())
                .flatMap(ignored -> {
                var now = System.currentTimeMillis();
                if (!allowGlobalVisit(now) || VisitorStatsSupport.rateLimited(recentVisitorAt.get(visitorHash), now)) {
                    return client.fetch(ConfigMap.class, VISITOR_STATS_NAME)
                        .map(config -> statsPayload(config.getData()))
                        .defaultIfEmpty(statsPayload(Map.of()))
                        .flatMap(payload -> visitResponse(payload, visitorId))
                        .doFinally(signal -> visitorStatsLock.release());
                }
                recentVisitorAt.put(visitorHash, now);
                recentVisitorAt.entrySet().removeIf(entry -> now - entry.getValue() >= VisitorStatsSupport.VISIT_COOLDOWN_MILLIS);
                while (recentVisitorAt.size() > VisitorStatsSupport.MAX_RECENT_VISITORS) {
                    var iterator = recentVisitorAt.keySet().iterator();
                    if (!iterator.hasNext()) break;
                    recentVisitorAt.remove(iterator.next());
                }
                return client.fetch(ConfigMap.class, VISITOR_STATS_NAME)
                    .defaultIfEmpty(newStatsConfig())
                    .flatMap(config -> {
                        var data = config.getData() == null ? new HashMap<String, String>() : new HashMap<>(config.getData());
                        var today = LocalDate.now().toString();
                        if (!today.equals(data.get("date"))) {
                            data.put("date", today);
                            data.put("todayVisitors", "0");
                            data.put("todayVisits", "0");
                            data.put("todayVisitorIds", "");
                        }
                        var knownIds = VisitorStatsSupport.boundedIds(data.get("knownVisitorIds"),
                            VisitorStatsSupport.MAX_KNOWN_VISITORS);
                        var todayIds = VisitorStatsSupport.boundedIds(data.get("todayVisitorIds"),
                            VisitorStatsSupport.MAX_TODAY_VISITORS);
                        var isNewVisitor = knownIds.add(visitorHash);
                        var isNewTodayVisitor = todayIds.add(visitorHash);
                        while (knownIds.size() > VisitorStatsSupport.MAX_KNOWN_VISITORS) {
                            knownIds.remove(knownIds.iterator().next());
                        }
                        while (todayIds.size() > VisitorStatsSupport.MAX_TODAY_VISITORS) {
                            todayIds.remove(todayIds.iterator().next());
                        }
                        data.put("knownVisitorIds", String.join(",", knownIds));
                        data.put("todayVisitorIds", String.join(",", todayIds));
                        data.put("todayVisitors", Integer.toString(incrementIfNew(
                            parseCounter(data.get("todayVisitors")), isNewTodayVisitor)));
                        data.put("todayVisits", Integer.toString(VisitorStatsSupport.increment(parseCounter(data.get("todayVisits")))));
                        data.put("totalVisitors", Integer.toString(incrementIfNew(
                            parseCounter(data.get("totalVisitors")), isNewVisitor)));
                        data.put("totalVisits", Integer.toString(VisitorStatsSupport.increment(parseCounter(data.get("totalVisits")))));
                        config.setData(data);
                        return config.getMetadata().getVersion() == null ? client.create(config) : client.update(config);
                    })
                    .map(config -> statsPayload(config.getData()))
                    .flatMap(payload -> visitResponse(payload, visitorId))
                    .doFinally(signal -> visitorStatsLock.release());
                });
        }).onErrorResume(this::errorResponse);
    }

    /** Must be called while visitorStatsLock is held. */
    private boolean allowGlobalVisit(long now) {
        var started = visitorWindowStartedAt.get();
        if (started == 0L || now - started >= VisitorStatsSupport.GLOBAL_WINDOW_MILLIS) {
            visitorWindowStartedAt.set(now);
            visitorWindowWrites.set(0);
        }
        return visitorWindowWrites.incrementAndGet() <= VisitorStatsSupport.MAX_WRITES_PER_WINDOW;
    }

    private Mono<Boolean> visitorStatsEnabled() {
        return client.fetch(ShowcaseSettings.class, SETTINGS_NAME)
            .map(ShowcaseSettings::getSpec)
            .map(spec -> spec != null && Boolean.TRUE.equals(spec.getVisitorStatsEnabled()))
            .defaultIfEmpty(false);
    }

    private Mono<ServerResponse> visitResponse(Map<String, Integer> payload, String visitorId) {
        var response = ServerResponse.ok().contentType(APPLICATION_JSON)
            .cacheControl(CacheControl.noStore()).cookie(ResponseCookie.from(VISITOR_COOKIE, visitorId)
                .httpOnly(true).path("/").maxAge(Duration.ofDays(365)).sameSite("Lax").build());
        return response.bodyValue(payload);
    }

    private ConfigMap newStatsConfig() {
        var config = new ConfigMap();
        var metadata = new Metadata();
        metadata.setName(VISITOR_STATS_NAME);
        config.setMetadata(metadata);
        config.setData(new HashMap<>());
        return config;
    }

    private Map<String, Integer> statsPayload(Map<String, String> data) {
        return Map.of("todayVisitors", parseCounter(data.get("todayVisitors")),
            "todayVisits", parseCounter(data.get("todayVisits")),
            "totalVisitors", parseCounter(data.get("totalVisitors")),
            "totalVisits", parseCounter(data.get("totalVisits")));
    }

    private int parseCounter(String value) {
        try { return Math.max(0, Integer.parseInt(value)); }
        catch (RuntimeException ignored) { return 0; }
    }

    private int incrementIfNew(int value, boolean isNew) {
        return isNew ? VisitorStatsSupport.increment(value) : value;
    }

    private Mono<ServerResponse> updateSettings(ServerRequest request) {
        return request.bodyToMono(ShowcaseSettings.SettingsSpec.class)
            .map(this::normalizeSettings)
            .flatMap(spec -> client.fetch(ShowcaseSettings.class, SETTINGS_NAME)
                .defaultIfEmpty(newSettings())
                .flatMap(settings -> {
                    settings.setSpec(spec);
                    return settings.getMetadata().getVersion() == null
                        ? client.create(settings) : client.update(settings);
                }))
            .map(ShowcaseSettings::getSpec)
            .flatMap(this::ok)
            .onErrorResume(this::errorResponse);
    }

    private Mono<ShowcaseItem.ItemSpec> validateItem(ShowcaseItem.ItemSpec spec) {
        spec.setTitle(trim(spec.getTitle(), 120));
        spec.setDescription(trim(spec.getDescription(), 3000));
        spec.setImpression(trim(spec.getImpression(), 5000));
        spec.setWatchUrl(trim(spec.getWatchUrl(), 2000));
        spec.setExternalUrl(trim(spec.getExternalUrl(), 2000));
        spec.setTags(normalizeTags(spec.getTags()));
        spec.setSubcategory(trim(spec.getSubcategory(), 120));
        spec.setCover(trim(spec.getCover(), 2000));
        spec.setStatus(trim(spec.getStatus(), 30));
        spec.setPriority(safeInt(spec.getPriority()));
        spec.setScore(normalizeScore(spec.getScore()));
        spec.setLikes(safeLikes(spec.getLikes()));
        if (spec.getCustomFields() == null) spec.setCustomFields(new java.util.LinkedHashMap<>());
        spec.setCustomFields(spec.getCustomFields().entrySet().stream().limit(20)
            .collect(java.util.stream.Collectors.toMap(entry -> trim(entry.getKey(), 50), entry -> trim(entry.getValue(), 2000), (left, right) -> right, java.util.LinkedHashMap::new)));
        if (spec.getPublished() == null) spec.setPublished(true);
        // When the item is bound to a non-standard (non-preset-standard) template, the legacy
        // standard fields are meaningless. Clear them so the front-end does not render stale
        // defaults such as "已看完" on a 美食探店 item.
        String effectiveTemplate = spec.getTemplate() == null ? "" : spec.getTemplate().trim();
        if (!effectiveTemplate.isEmpty() && !"standard".equals(effectiveTemplate)
            && !"preset-standard".equals(effectiveTemplate)) {
            spec.setStatus("");
        }
        if (spec.getTitle().isBlank()) return Mono.error(new IllegalArgumentException("标题不能为空"));
        if (spec.getCategory() == null || spec.getCategory().isBlank()) {
            return Mono.error(new IllegalArgumentException("请选择分类"));
        }
        if (!spec.getWatchUrl().isBlank() && !isSafeLink(spec.getWatchUrl())) {
            return Mono.error(new IllegalArgumentException("观看链接仅支持 http 或 https"));
        }
        if (!spec.getExternalUrl().isBlank() && !isSafeLink(spec.getExternalUrl())) {
            return Mono.error(new IllegalArgumentException("其他链接仅支持 http 或 https"));
        }
        return Mono.just(spec);
    }

    private List<String> normalizeTags(List<String> tags) {
        if (tags == null) return new ArrayList<>();
        return tags.stream()
            .filter(java.util.Objects::nonNull)
            .flatMap(value -> java.util.Arrays.stream(value.split("[,，、\\n]")))
            .map(value -> trim(value, 24))
            .filter(value -> !value.isBlank())
            .distinct()
            .limit(6)
            .toList();
    }

    private Mono<ShowcaseSubcategory.SubcategorySpec> validateSubcategory(
        ShowcaseSubcategory.SubcategorySpec spec) {
        spec.setCategory(trim(spec.getCategory(), 120));
        spec.setDisplayName(trim(spec.getDisplayName(), 80));
        spec.setDescription(trim(spec.getDescription(), 300));
        spec.setIcon(trim(spec.getIcon(), 12));
        spec.setPriority(Math.max(1, safeInt(spec.getPriority())));
        if (spec.getVisible() == null) spec.setVisible(true);
        if (spec.getCategory().isBlank() || spec.getDisplayName().isBlank()) {
            return Mono.error(new IllegalArgumentException("请填写所属分类和二级标题"));
        }
        return Mono.just(spec);
    }

    private Mono<ShowcaseCategory.CategorySpec> validateCategory(ShowcaseCategory.CategorySpec spec) {
        spec.setDisplayName(trim(spec.getDisplayName(), 50));
        spec.setDescription(trim(spec.getDescription(), 200));
        spec.setIcon(trim(spec.getIcon(), 12));
        spec.setPriority(safeInt(spec.getPriority()));
        var templateName = trim(spec.getTemplate(), 120);
        spec.setTemplate(templateName.isBlank() ? "standard" : templateName);
        if (spec.getTemplateFields() == null) spec.setTemplateFields(new ArrayList<>());
        var keys = new java.util.HashSet<String>();
        spec.setTemplateFields(spec.getTemplateFields().stream().limit(12).filter(java.util.Objects::nonNull)
            .map(field -> { field.setKey(trim(field.getKey(), 50)); field.setLabel(trim(field.getLabel(), 80)); var type = trim(field.getType(), 20); field.setType(Set.of("text", "textarea", "number", "url", "date", "image", "tags").contains(type) ? type : "text"); if (field.getRequired() == null) field.setRequired(false); if (field.getShowInCard() == null) field.setShowInCard(false); return field; })
            .filter(field -> !field.getKey().isBlank() && !field.getLabel().isBlank() && keys.add(field.getKey())).toList());
        if (spec.getVisible() == null) spec.setVisible(true);
        if (spec.getDisplayName().isBlank()) {
            return Mono.error(new IllegalArgumentException("分类标题不能为空"));
        }
        return Mono.just(spec);
    }

    /**
     * When a category references a template, refresh its
     * {@code templateFields} from the latest template definition so that any
     * fields whose type was previously downgraded by the validator
     * (e.g. {@code tags} or {@code image}) are restored. Custom fields the
     * user added beyond what the template exposes are preserved.
     */
    private Mono<ShowcaseCategory.CategorySpec> syncTemplateFieldsFromTemplate(
            ShowcaseCategory.CategorySpec spec) {
        var templateName = spec.getTemplate();
        if (templateName == null || templateName.isBlank() || "standard".equals(templateName)) {
            return Mono.just(spec);
        }
        return client.fetch(ShowcaseTemplate.class, templateName)
            .map(template -> {
                var templateFields = template.getSpec() == null
                    ? java.util.List.<ShowcaseCategory.TemplateField>of()
                    : template.getSpec().getFields();
                if (templateFields == null) templateFields = java.util.List.of();
                var byKey = new java.util.HashMap<String, ShowcaseCategory.TemplateField>();
                for (var field : templateFields) {
                    if (field != null && field.getKey() != null && !field.getKey().isBlank()) {
                        byKey.put(field.getKey(), field);
                    }
                }
                var current = spec.getTemplateFields();
                if (current == null) current = new ArrayList<>();
                var merged = new java.util.LinkedHashMap<String, ShowcaseCategory.TemplateField>();
                // Existing user entries first so any extra custom fields are kept.
                for (var field : current) {
                    if (field != null && field.getKey() != null && !field.getKey().isBlank()) {
                        var canonical = byKey.get(field.getKey());
                        if (canonical != null) {
                            // Overwrite with the template-defined field so its type,
                            // label, and other metadata are always in sync with the
                            // current template definition.
                            merged.put(field.getKey(), canonical);
                        } else {
                            merged.put(field.getKey(), field);
                        }
                    }
                }
                // Append any template-defined fields the category is missing so the
                // user does not have to re-add them manually after a template update.
                for (var entry : byKey.entrySet()) {
                    merged.putIfAbsent(entry.getKey(), entry.getValue());
                }
                spec.setTemplateFields(new ArrayList<>(merged.values()));
                return spec;
            })
            .defaultIfEmpty(spec);
    }

    private ShowcaseTemplate.TemplateSpec normalizeTemplate(ShowcaseTemplate.TemplateSpec spec) {
        spec.setDisplayName(trim(spec.getDisplayName(), 50));
        spec.setDescription(trim(spec.getDescription(), 200));
        spec.setIcon(orDefault(trim(spec.getIcon(), 12), "✨"));
        if (spec.getDisplayName().isBlank()) throw new IllegalArgumentException("模板名称不能为空");
        if (spec.getFields() == null) spec.setFields(new ArrayList<>());
        var keys = new java.util.HashSet<String>();
        spec.setFields(spec.getFields().stream().filter(java.util.Objects::nonNull).limit(12).map(field -> {
            field.setKey(trim(field.getKey(), 50)); field.setLabel(trim(field.getLabel(), 80));
            var type = trim(field.getType(), 20); field.setType(Set.of("text", "textarea", "number", "url", "date", "image", "tags").contains(type) ? type : "text");
            field.setPlaceholder(trim(field.getPlaceholder(), 120)); field.setHelpText(trim(field.getHelpText(), 200));
            if (field.getRequired() == null) field.setRequired(false); if (field.getShowInCard() == null) field.setShowInCard(false); return field;
        }).filter(field -> !field.getKey().isBlank() && !field.getLabel().isBlank() && keys.add(field.getKey())).toList());
        return spec;
    }

    private ShowcaseSettings.SettingsSpec normalizeSettings(ShowcaseSettings.SettingsSpec spec) {
        var defaults = ShowcaseSettings.defaults();
        spec.setPageTitle(orDefault(trim(spec.getPageTitle(), 80), defaults.getPageTitle()));
        spec.setSubtitle(orDefault(trim(spec.getSubtitle(), 180), defaults.getSubtitle()));
        spec.setOwnerText(orDefault(trim(spec.getOwnerText(), 180), defaults.getOwnerText()));
        spec.setThemeColor(normalizeHexColor(spec.getThemeColor()));
        if (spec.getEffectEnabled() == null) spec.setEffectEnabled(defaults.getEffectEnabled());
        var effectType = trim(spec.getEffectType(), 20).toLowerCase(java.util.Locale.ROOT);
        spec.setEffectType("stars".equals(effectType) ? "stars" : "sakura");
        if (spec.getCommentEnabled() == null) spec.setCommentEnabled(defaults.getCommentEnabled());
        if (spec.getDetailCommentEnabled() == null) spec.setDetailCommentEnabled(defaults.getDetailCommentEnabled());
        spec.setCommentType(normalizeCommentType(spec.getCommentType()));
        spec.setTwikooEnvId(trim(spec.getTwikooEnvId(), 500));
        var twikooJsUrl = trim(spec.getTwikooJsUrl(), 2000);
        if (!twikooJsUrl.isBlank() && !isSafeLink(twikooJsUrl)) throw new IllegalArgumentException("Twikoo JS 地址仅支持 http 或 https");
        spec.setTwikooJsUrl(twikooJsUrl.isBlank() ? defaults.getTwikooJsUrl() : twikooJsUrl);
        if (spec.getCommentAnonymousEmail() == null) spec.setCommentAnonymousEmail(defaults.getCommentAnonymousEmail());
        if (spec.getSteamEnabled() == null) spec.setSteamEnabled(defaults.getSteamEnabled());
        if (spec.getHeroGifEnabled() == null) spec.setHeroGifEnabled(defaults.getHeroGifEnabled());
        var heroGifUrl = trim(spec.getHeroGifUrl(), 2000);
        spec.setHeroGifUrl(heroGifUrl.isBlank() ? defaults.getHeroGifUrl() : heroGifUrl);
        if (spec.getVisitorStatsEnabled() == null) spec.setVisitorStatsEnabled(defaults.getVisitorStatsEnabled());
        if (spec.getHeroBackgroundEnabled() == null) spec.setHeroBackgroundEnabled(defaults.getHeroBackgroundEnabled());
        spec.setHeroBackgroundType(normalizeMediaType(spec.getHeroBackgroundType()));
        spec.setHeroBackgroundUrl(trim(spec.getHeroBackgroundUrl(), 2000));
        spec.setHeroBackgroundOpacity(clampPercent(spec.getHeroBackgroundOpacity(), defaults.getHeroBackgroundOpacity()));
        spec.setHeroBackgroundSaturation(clampPercent(spec.getHeroBackgroundSaturation(), defaults.getHeroBackgroundSaturation()));
        if (spec.getContentBackgroundEnabled() == null) spec.setContentBackgroundEnabled(defaults.getContentBackgroundEnabled());
        spec.setContentBackgroundType(normalizeMediaType(spec.getContentBackgroundType()));
        spec.setContentBackgroundUrl(trim(spec.getContentBackgroundUrl(), 2000));
        spec.setContentBackgroundOpacity(clampPercent(spec.getContentBackgroundOpacity(), defaults.getContentBackgroundOpacity()));
        spec.setContentBackgroundSaturation(clampPercent(spec.getContentBackgroundSaturation(), defaults.getContentBackgroundSaturation()));
        if (spec.getSignatureEnabled() == null) spec.setSignatureEnabled(defaults.getSignatureEnabled());
        spec.setSignatureText(orDefault(trim(spec.getSignatureText(), 240), defaults.getSignatureText()));
        spec.setDefaultItemPosition("start".equalsIgnoreCase(trim(spec.getDefaultItemPosition(), 10)) ? "start" : "end");
        return spec;
    }

    private String normalizeMediaType(String value) {
        return "video".equalsIgnoreCase(trim(value, 10)) ? "video" : "image";
    }

    private String normalizeCommentType(String value) {
        var normalized = trim(value, 20).toLowerCase(java.util.Locale.ROOT);
        if ("twikoo".equals(normalized)) return "twikoo";
        if ("halonext".equals(normalized) || "halo-next".equals(normalized) || "next".equals(normalized)) return "haloNext";
        return "halo";
    }

    private int clampPercent(Integer value, Integer fallback) {
        return Math.max(0, Math.min(100, value == null ? safeInt(fallback) : value));
    }

    private String normalizeHexColor(String value) {
        var color = trim(value, 7).toUpperCase(java.util.Locale.ROOT);
        if (!color.startsWith("#")) color = "#" + color;
        if (color.matches("#[0-9A-F]{3}")) {
            color = "#" + color.charAt(1) + color.charAt(1)
                + color.charAt(2) + color.charAt(2)
                + color.charAt(3) + color.charAt(3);
        }
        return color.matches("#[0-9A-F]{6}")
            ? color : ShowcaseSettings.DEFAULT_THEME_COLOR;
    }

    private ShowcaseSettings newSettings() {
        var settings = new ShowcaseSettings();
        var metadata = new Metadata();
        metadata.setName(SETTINGS_NAME);
        settings.setMetadata(metadata);
        return settings;
    }

    private ShowcaseCategory defaultAnimeCategory() {
        var category = new ShowcaseCategory();
        var metadata = new Metadata();
        metadata.setName("anime");
        category.setMetadata(metadata);
        category.getSpec().setDisplayName("动漫");
        category.getSpec().setDescription("追过的番与念念不忘的二次元故事");
        category.getSpec().setIcon("🌸");
        return category;
    }

    private Metadata metadata(String prefix) {
        var metadata = new Metadata();
        metadata.setName(prefix + UUID.randomUUID().toString().replace("-", "").substring(0, 12));
        return metadata;
    }

    private boolean isSafeLink(String value) {
        try {
            var scheme = URI.create(value).getScheme();
            return "http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme);
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }

    private String publicHttpUrl(String value) {
        var normalized = trim(value, 2000);
        return normalized.isBlank() || !isSafeLink(normalized) ? "" : normalized;
    }

    private String publicMediaUrl(String value) {
        var normalized = trim(value, 2000);
        if (normalized.isBlank()) return "";
        if (normalized.startsWith("/") && !normalized.startsWith("//")) return normalized;
        return publicHttpUrl(normalized);
    }

    private String trim(String value, int maxLength) {
        if (value == null) return "";
        var result = value.trim();
        return result.length() <= maxLength ? result : result.substring(0, maxLength);
    }

    private String orDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private int safeInt(Integer value) {
        return value == null ? 0 : value;
    }

    private int safeLikes(Integer value) {
        return Math.max(0, value == null ? 0 : value);
    }

    private BigDecimal normalizeScore(BigDecimal value) {
        if (value == null) return BigDecimal.ZERO.setScale(1);
        return value.max(BigDecimal.ZERO).min(BigDecimal.TEN)
            .setScale(1, RoundingMode.HALF_UP);
    }

    private Mono<ServerResponse> ok(Object body) {
        return ServerResponse.ok().contentType(APPLICATION_JSON)
            .cacheControl(CacheControl.noStore()).bodyValue(body);
    }

    private Mono<ServerResponse> created(Object body) {
        return ServerResponse.status(201).contentType(APPLICATION_JSON).bodyValue(body);
    }

    private Mono<ServerResponse> badRequest(String message) {
        return ServerResponse.badRequest().contentType(APPLICATION_JSON)
            .bodyValue(Map.of("message", message));
    }

    private Mono<ServerResponse> tooManyRequests() {
        return ServerResponse.status(429).contentType(APPLICATION_JSON)
            .cacheControl(CacheControl.noStore())
            .bodyValue(Map.of("message", "操作过于频繁，请稍后再试"));
    }

    private Mono<ServerResponse> errorResponse(Throwable error) {
        var message = error.getMessage() == null ? "操作失败" : error.getMessage();
        return ServerResponse.badRequest().contentType(APPLICATION_JSON)
            .bodyValue(Map.of("message", message));
    }

    private Mono<ServerResponse> publicErrorResponse(Throwable error) {
        return ServerResponse.status(503).contentType(APPLICATION_JSON)
            .cacheControl(CacheControl.noStore())
            .bodyValue(Map.of("message", "公开数据暂时不可用"));
    }

    @Override
    public GroupVersion groupVersion() {
        return new GroupVersion("api.showcase.halo.run", "v1alpha1");
    }
}
