package com.wangxinyang.showcase;

import static org.springframework.http.MediaType.APPLICATION_JSON;

import com.wangxinyang.showcase.extension.ShowcaseCategory;
import com.wangxinyang.showcase.extension.ShowcaseItem;
import com.wangxinyang.showcase.extension.ShowcaseSettings;
import com.wangxinyang.showcase.extension.ShowcaseSubcategory;
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
    private static final String VISITOR_STATS_NAME = "showcase-visitor-stats";
    private static final String VISITOR_COOKIE = "showcase-visitor-id";
    // ConfigMap updates are serialized so concurrent requests cannot overwrite counters.
    // Semaphore release is safe even when the reactive chain resumes on another thread.
    private final Semaphore visitorStatsLock = new Semaphore(1);
    private final ConcurrentHashMap<String, Long> recentVisitorAt = new ConcurrentHashMap<>();
    private final AtomicLong visitorWindowStartedAt = new AtomicLong();
    private final AtomicInteger visitorWindowWrites = new AtomicInteger();
    private final ReactiveExtensionClient client;

    @Override
    public RouterFunction<ServerResponse> endpoint() {
        return RouterFunctions.route()
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
            .POST("/categories", RequestPredicates.accept(APPLICATION_JSON), this::createCategory)
            .PUT("/categories/{name}", RequestPredicates.accept(APPLICATION_JSON), this::updateCategory)
            .DELETE("/categories/{name}", this::deleteCategory)
            .POST("/subcategories", RequestPredicates.accept(APPLICATION_JSON), this::createSubcategory)
            .PUT("/subcategories/{name}", RequestPredicates.accept(APPLICATION_JSON), this::updateSubcategory)
            .DELETE("/subcategories/{name}", this::deleteSubcategory)
            .PUT("/admin/settings", RequestPredicates.accept(APPLICATION_JSON), this::updateSettings)
            .build();
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
            .map(this::commentWidgetStatus)
            .defaultIfEmpty(CommentWidgetStatus.notInstalled());
        return Mono.zip(showcaseSettings, siteSettings, steamStatus, commentWidgetStatus)
            .map(tuple -> publicSettings(tuple.getT1(), tuple.getT2(), tuple.getT3(), tuple.getT4()))
            .flatMap(this::ok);
    }

    private PublicSettings publicSettings(ShowcaseSettings.SettingsSpec showcase,
        SystemSetting.Basic site, SteamStatus steamStatus, CommentWidgetStatus commentWidgetStatus) {
        var siteName = orDefault(trim(site.getTitle(), 120), "我的博客");
        // Keep the navigation logo and browser favicon independent. The navigation
        // follows Halo's site Logo setting, while the document icon follows Favicon.
        var siteLogo = trim(site.getLogo(), 2000);
        var siteFavicon = trim(site.getFavicon(), 2000);
        return new PublicSettings(showcase.getPageTitle(), showcase.getSubtitle(),
            showcase.getOwnerText(), showcase.getThemeColor(), showcase.getEffectEnabled(),
            showcase.getEffectType(), showcase.getCommentEnabled(), showcase.getSteamEnabled(),
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
            commentWidgetStatus.installed(), commentWidgetStatus.active(), commentWidgetStatus.message());
    }

    private record PublicSettings(String pageTitle, String subtitle, String ownerText,
                                  String themeColor, Boolean effectEnabled, String effectType,
                                  Boolean commentEnabled, Boolean steamEnabled,
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
                                  String commentWidgetMessage) {
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

    private CommentWidgetStatus commentWidgetStatus(Plugin plugin) {
        var enabled = plugin.getSpec() != null && Boolean.TRUE.equals(plugin.getSpec().getEnabled());
        var phase = plugin.getStatus() == null ? null : plugin.getStatus().getPhase();
        var active = enabled && Plugin.Phase.STARTED.equals(phase);
        if (!enabled) {
            return new CommentWidgetStatus(true, false, "评论组件插件已安装，但尚未启用");
        }
        if (!active) {
            var phaseText = phase == null ? "未知" : phase.name();
            return new CommentWidgetStatus(true, false,
                "评论组件插件尚未正常运行（当前状态：" + phaseText + "）");
        }
        return new CommentWidgetStatus(true, true, "评论组件插件已安装并正常运行");
    }

    private record CommentWidgetStatus(boolean installed, boolean active, String message) {
        private static CommentWidgetStatus notInstalled() {
            return new CommentWidgetStatus(false, false, "尚未安装 Halo 评论组件插件");
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
        if (itemName.isBlank()) return badRequest("缺少展示内容名称");
        return client.get(ShowcaseItem.class, itemName)
            .map(item -> {
                var spec = item.getSpec();
                var currentLikes = safeLikes(spec.getLikes());
                spec.setLikes(currentLikes == Integer.MAX_VALUE ? currentLikes : currentLikes + 1);
                return item;
            })
            .flatMap(client::update)
            .flatMap(item -> ok(item.getSpec()))
            .onErrorResume(this::errorResponse);
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
            .map(spec -> {
                var category = new ShowcaseCategory();
                category.setMetadata(metadata("showcase-category-"));
                category.setSpec(spec);
                return category;
            })
            .flatMap(client::create)
            .flatMap(this::created)
            .onErrorResume(this::errorResponse);
    }

    private Mono<ServerResponse> updateCategory(ServerRequest request) {
        var name = request.pathVariable("name");
        return request.bodyToMono(ShowcaseCategory.CategorySpec.class)
            .flatMap(this::validateCategory)
            .zipWith(client.get(ShowcaseCategory.class, name))
            .map(tuple -> {
                var category = tuple.getT2();
                category.setSpec(tuple.getT1());
                return category;
            })
            .flatMap(client::update)
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
            .flatMap(client::create).flatMap(this::created)
            .onErrorResume(this::errorResponse);
    }

    private Mono<ServerResponse> updateSubcategory(ServerRequest request) {
        var name = request.pathVariable("name");
        return request.bodyToMono(ShowcaseSubcategory.SubcategorySpec.class)
            .flatMap(this::validateSubcategory)
            .zipWith(client.get(ShowcaseSubcategory.class, name))
            .map(tuple -> { var item = tuple.getT2(); item.setSpec(tuple.getT1()); return item; })
            .flatMap(client::update).flatMap(this::ok)
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
        if (spec.getPublished() == null) spec.setPublished(true);
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
        spec.setPriority(safeInt(spec.getPriority()));
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
        if (spec.getVisible() == null) spec.setVisible(true);
        if (spec.getDisplayName().isBlank()) {
            return Mono.error(new IllegalArgumentException("分类标题不能为空"));
        }
        return Mono.just(spec);
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
        return spec;
    }

    private String normalizeMediaType(String value) {
        return "video".equalsIgnoreCase(trim(value, 10)) ? "video" : "image";
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

    private Mono<ServerResponse> errorResponse(Throwable error) {
        var message = error.getMessage() == null ? "操作失败" : error.getMessage();
        return ServerResponse.badRequest().contentType(APPLICATION_JSON)
            .bodyValue(Map.of("message", message));
    }

    @Override
    public GroupVersion groupVersion() {
        return new GroupVersion("api.showcase.halo.run", "v1alpha1");
    }
}
