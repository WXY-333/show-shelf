package com.wangxinyang.showcase;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/** Pure helpers for validating and bounding anonymous visitor statistics data. */
final class VisitorStatsSupport {
    static final int MAX_COOKIE_LENGTH = 128;
    static final int MAX_KNOWN_VISITORS = 10_000;
    static final int MAX_TODAY_VISITORS = 5_000;
    static final int MAX_RECENT_VISITORS = 10_000;
    static final long VISIT_COOLDOWN_MILLIS = 30_000L;
    static final long GLOBAL_WINDOW_MILLIS = 60_000L;
    static final int MAX_WRITES_PER_WINDOW = 600;
    private static final Pattern UUID_PATTERN = Pattern.compile(
        "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$");

    private VisitorStatsSupport() {
    }

    static String validOrNewUuid(String raw) {
        if (raw == null || raw.length() > MAX_COOKIE_LENGTH || !UUID_PATTERN.matcher(raw).matches()) {
            return UUID.randomUUID().toString();
        }
        try {
            var normalized = UUID.fromString(raw).toString();
            return normalized.equalsIgnoreCase(raw) ? normalized : UUID.randomUUID().toString();
        } catch (IllegalArgumentException ignored) {
            return UUID.randomUUID().toString();
        }
    }

    static String hashVisitorId(String visitorId) {
        try {
            var digest = MessageDigest.getInstance("SHA-256");
            var bytes = digest.digest(visitorId.getBytes(StandardCharsets.UTF_8));
            var result = new StringBuilder(bytes.length * 2);
            for (var value : bytes) {
                result.append(Character.forDigit((value >>> 4) & 0x0f, 16));
                result.append(Character.forDigit(value & 0x0f, 16));
            }
            return result.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available", exception);
        }
    }

    static LinkedHashSet<String> boundedIds(String stored, int maxSize) {
        var ids = new LinkedHashSet<String>();
        if (stored == null || stored.isBlank()) {
            return ids;
        }
        for (var id : stored.split(",")) {
            if (id.length() == 64 && id.matches("[0-9a-f]{64}")) {
                ids.add(id);
                while (ids.size() > maxSize) {
                    ids.remove(ids.iterator().next());
                }
            }
        }
        return ids;
    }

    static String joinBounded(Set<String> ids, int maxSize) {
        var bounded = new LinkedHashSet<String>();
        for (var id : ids) {
            if (id != null && id.length() == 64 && id.matches("[0-9a-f]{64}")) {
                bounded.add(id);
                while (bounded.size() > maxSize) {
                    bounded.remove(bounded.iterator().next());
                }
            }
        }
        return String.join(",", bounded);
    }

    static int increment(int value) {
        return value == Integer.MAX_VALUE ? value : Math.max(0, value) + 1;
    }

    static boolean rateLimited(Long lastVisitAt, long now) {
        return lastVisitAt != null && now >= lastVisitAt && now - lastVisitAt < VISIT_COOLDOWN_MILLIS;
    }
}
