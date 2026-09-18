package com.wangxinyang.showcase;

import com.wangxinyang.showcase.extension.ShowcaseCategory;
import com.wangxinyang.showcase.extension.ShowcaseItem;
import com.wangxinyang.showcase.extension.ShowcaseSettings;
import com.wangxinyang.showcase.extension.ShowcaseSubcategory;
import com.wangxinyang.showcase.extension.ShowcaseTemplate;
import org.springframework.stereotype.Component;
import run.halo.app.extension.Metadata;
import run.halo.app.extension.ReactiveExtensionClient;
import run.halo.app.extension.Scheme;
import run.halo.app.extension.SchemeManager;
import run.halo.app.extension.index.IndexSpecs;
import run.halo.app.plugin.BasePlugin;
import run.halo.app.plugin.PluginContext;

@Component
public class ShowcasePlugin extends BasePlugin {

    private final SchemeManager schemeManager;
    private final ReactiveExtensionClient client;

    public ShowcasePlugin(PluginContext pluginContext, SchemeManager schemeManager,
        ReactiveExtensionClient client) {
        super(pluginContext);
        this.schemeManager = schemeManager;
        this.client = client;
    }

    @Override
    public void start() {
        // Halo 2.26 requires at least one registered index for extension list
        // queries.  These indexes also cover the predicates used by the
        // public/admin endpoints (category, subcategory and ordering).
        schemeManager.register(ShowcaseItem.class, indexes -> {
            indexes.add(IndexSpecs.<ShowcaseItem, String>single("metadata.name", String.class)
                .indexFunc(item -> item.getMetadata().getName()).unique(true).build());
            indexes.add(IndexSpecs.<ShowcaseItem, String>single("spec.category", String.class)
                .indexFunc(item -> item.getSpec().getCategory()).nullable(true).build());
            indexes.add(IndexSpecs.<ShowcaseItem, String>single("spec.subcategory", String.class)
                .indexFunc(item -> item.getSpec().getSubcategory()).nullable(true).build());
            indexes.add(IndexSpecs.<ShowcaseItem, Integer>single("spec.priority", Integer.class)
                .indexFunc(item -> item.getSpec().getPriority()).nullable(true).build());
        });
        schemeManager.register(ShowcaseCategory.class, indexes -> {
            indexes.add(IndexSpecs.<ShowcaseCategory, String>single("metadata.name", String.class)
                .indexFunc(category -> category.getMetadata().getName()).unique(true).build());
            indexes.add(IndexSpecs.<ShowcaseCategory, Integer>single("spec.priority", Integer.class)
                .indexFunc(category -> category.getSpec().getPriority()).nullable(true).build());
        });
        schemeManager.register(ShowcaseSettings.class);
        schemeManager.register(ShowcaseTemplate.class, indexes -> indexes.add(IndexSpecs.<ShowcaseTemplate, String>single("metadata.name", String.class).indexFunc(template -> template.getMetadata().getName()).unique(true).build()));
        schemeManager.register(ShowcaseSubcategory.class, indexes -> {
            indexes.add(IndexSpecs.<ShowcaseSubcategory, String>single("metadata.name", String.class)
                .indexFunc(subcategory -> subcategory.getMetadata().getName()).unique(true).build());
            indexes.add(IndexSpecs.<ShowcaseSubcategory, String>single("spec.category", String.class)
                .indexFunc(subcategory -> subcategory.getSpec().getCategory()).nullable(true).build());
            indexes.add(IndexSpecs.<ShowcaseSubcategory, Integer>single("spec.priority", Integer.class)
                .indexFunc(subcategory -> subcategory.getSpec().getPriority()).nullable(true).build());
        });
        seedDefaults();
        System.out.println("Showcase plugin started. Public page: /movie");
    }

    @Override
    public void stop() {
        schemeManager.unregister(Scheme.buildFromType(ShowcaseItem.class));
        schemeManager.unregister(Scheme.buildFromType(ShowcaseCategory.class));
        schemeManager.unregister(Scheme.buildFromType(ShowcaseSettings.class));
        schemeManager.unregister(Scheme.buildFromType(ShowcaseSubcategory.class));
        schemeManager.unregister(Scheme.buildFromType(ShowcaseTemplate.class));
    }

    private void seedDefaults() {
        client.fetch(ShowcaseCategory.class, "anime")
            .switchIfEmpty(client.create(defaultAnimeCategory()))
            .subscribe();
        client.fetch(ShowcaseSettings.class, "showcase-settings")
            .switchIfEmpty(client.create(defaultSettings()))
            .subscribe();
        // For built-in templates we always sync the spec with the latest preset
        // definition so that renamed display names, icons, descriptions and
        // field updates propagate on plugin startup. Custom user-defined
        // templates are never touched.
        for (var preset : PluginPresets.builtInTemplates()) {
            client.fetch(ShowcaseTemplate.class, preset.name())
                .flatMap(existing -> {
                    existing.setSpec(preset.template().getSpec());
                    return client.update(existing);
                })
                .switchIfEmpty(client.create(preset.template()))
                .subscribe();
        }
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

    private ShowcaseSettings defaultSettings() {
        var settings = new ShowcaseSettings();
        var metadata = new Metadata();
        metadata.setName("showcase-settings");
        settings.setMetadata(metadata);
        return settings;
    }
}
