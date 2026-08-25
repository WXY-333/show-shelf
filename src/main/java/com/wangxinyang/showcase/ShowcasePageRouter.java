package com.wangxinyang.showcase;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.web.reactive.function.server.RouterFunction;
import org.springframework.web.reactive.function.server.RouterFunctions;
import org.springframework.web.reactive.function.server.ServerResponse;

@Configuration(proxyBeanMethods = false)
public class ShowcasePageRouter {

    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE + 100)
    RouterFunction<ServerResponse> moviePageRouter() throws IOException {
        var resource = new ClassPathResource("static/movie.html");
        var html = resource.getContentAsString(StandardCharsets.UTF_8);
        return RouterFunctions.route()
            .GET("/movie", request -> ServerResponse.ok()
                .contentType(MediaType.TEXT_HTML)
                .cacheControl(CacheControl.noCache())
                .bodyValue(html))
            .GET("/movie/", request -> ServerResponse.permanentRedirect(java.net.URI.create("/movie")).build())
            .build();
    }
}
