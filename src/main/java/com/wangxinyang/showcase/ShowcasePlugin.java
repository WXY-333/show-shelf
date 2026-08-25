package com.wangxinyang.showcase;

import com.wangxinyang.showcase.extension.ShowcaseCategory;
import com.wangxinyang.showcase.extension.ShowcaseItem;
import com.wangxinyang.showcase.extension.ShowcaseSettings;
import com.wangxinyang.showcase.extension.ShowcaseSubcategory;
import org.springframework.stereotype.Component;
import run.halo.app.extension.Metadata;
import run.halo.app.extension.ReactiveExtensionClient;
import run.halo.app.extension.Scheme;
import run.halo.app.extension.SchemeManager;
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
        schemeManager.register(ShowcaseItem.class);
        schemeManager.register(ShowcaseCategory.class);
        schemeManager.register(ShowcaseSettings.class);
        schemeManager.register(ShowcaseSubcategory.class);
        seedDefaults();
        System.out.println("Showcase plugin started. Public page: /movie");
    }

    @Override
    public void stop() {
        schemeManager.unregister(Scheme.buildFromType(ShowcaseItem.class));
        schemeManager.unregister(Scheme.buildFromType(ShowcaseCategory.class));
        schemeManager.unregister(Scheme.buildFromType(ShowcaseSettings.class));
        schemeManager.unregister(Scheme.buildFromType(ShowcaseSubcategory.class));
    }

    private void seedDefaults() {
        client.fetch(ShowcaseCategory.class, "anime")
            .switchIfEmpty(client.create(defaultAnimeCategory()))
            .subscribe();
        client.fetch(ShowcaseSettings.class, "showcase-settings")
            .switchIfEmpty(client.create(defaultSettings()))
            .subscribe();
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
