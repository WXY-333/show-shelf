package com.wangxinyang.showcase;

import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.web.reactive.function.server.RouterFunction;
import org.springframework.web.reactive.function.server.RouterFunctions;
import org.springframework.web.reactive.function.server.ServerRequest;
import org.springframework.web.reactive.function.server.ServerResponse;
import reactor.core.publisher.Mono;
import run.halo.app.theme.TemplateNameResolver;

@Configuration(proxyBeanMethods = false)
public class ShowcasePageRouter {

    private final TemplateNameResolver templateNameResolver;

    public ShowcasePageRouter(TemplateNameResolver templateNameResolver) {
        this.templateNameResolver = templateNameResolver;
    }

    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE + 100)
    RouterFunction<ServerResponse> moviePageRouter() {
        return RouterFunctions.route()
            .GET("/movie", this::renderMovie)
            .GET("/movie/", request -> ServerResponse.permanentRedirect(java.net.URI.create("/movie")).build())
            .GET("/movie/{item}", this::renderMovie)
            .build();
    }

    private Mono<ServerResponse> renderMovie(ServerRequest request) {
        return templateNameResolver.resolveTemplateNameOrDefault(request.exchange(), "movie")
            .flatMap(templateName -> ServerResponse.ok()
                .contentType(MediaType.TEXT_HTML)
                .cacheControl(CacheControl.noCache())
                .render(templateName, Map.of()));
    }
}
