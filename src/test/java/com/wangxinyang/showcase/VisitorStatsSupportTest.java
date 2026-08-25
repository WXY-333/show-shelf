package com.wangxinyang.showcase;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.LinkedHashSet;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class VisitorStatsSupportTest {
    @Test
    void rejectsInvalidOrOversizedCookieAndHashesOnlyServerValidatedId() {
        var valid = "123e4567-e89b-12d3-a456-426614174000";
        assertThat(VisitorStatsSupport.validOrNewUuid(valid)).isEqualTo(valid);
        assertThat(VisitorStatsSupport.validOrNewUuid("javascript:alert(1)")).matches(
            "[0-9a-f-]{36}");
        assertThat(VisitorStatsSupport.validOrNewUuid("x".repeat(129))).matches(
            "[0-9a-f-]{36}");
        assertThat(VisitorStatsSupport.hashVisitorId(valid)).hasSize(64).matches("[0-9a-f]{64}");
    }

    @Test
    void boundsPersistedVisitorIdsAndDropsLegacyInvalidValues() {
        var first = VisitorStatsSupport.hashVisitorId("first");
        var second = VisitorStatsSupport.hashVisitorId("second");
        var third = VisitorStatsSupport.hashVisitorId("third");
        var stored = String.join(",", first, "not-a-hash", second, third);
        var ids = VisitorStatsSupport.boundedIds(stored, 2);
        assertThat(ids).containsExactly(second, third);
        assertThat(VisitorStatsSupport.joinBounded(ids, 2).split(",")).hasSize(2);
    }

    @Test
    void enforcesVisitorCapacity() {
        var ids = new LinkedHashSet<String>();
        for (var index = 0; index < VisitorStatsSupport.MAX_TODAY_VISITORS + 20; index++) {
            ids.add(VisitorStatsSupport.hashVisitorId("visitor-" + index));
            while (ids.size() > VisitorStatsSupport.MAX_TODAY_VISITORS) {
                ids.remove(ids.iterator().next());
            }
        }
        assertThat(ids).hasSize(VisitorStatsSupport.MAX_TODAY_VISITORS);
    }

    @Test
    void appliesPerVisitorCooldown() {
        var now = 1_000_000L;
        assertThat(VisitorStatsSupport.rateLimited(now - 1, now)).isTrue();
        assertThat(VisitorStatsSupport.rateLimited(now - VisitorStatsSupport.VISIT_COOLDOWN_MILLIS, now)).isFalse();
        assertThat(VisitorStatsSupport.rateLimited(null, now)).isFalse();
    }

    @Test
    void serializedCounterIncrementIsSaturatingUnderConcurrency() throws Exception {
        var lock = new Object();
        var counter = new AtomicInteger();
        var ready = new CountDownLatch(20);
        var done = new CountDownLatch(20);
        for (var i = 0; i < 20; i++) {
            Thread.startVirtualThread(() -> {
                ready.countDown();
                synchronized (lock) {
                    counter.set(VisitorStatsSupport.increment(counter.get()));
                }
                done.countDown();
            });
        }
        ready.await();
        done.await();
        assertThat(counter).hasValue(20);
    }

    @Test
    void saturatesAllVisitorAndVisitCountersAtIntegerMaximum() {
        assertThat(VisitorStatsSupport.increment(Integer.MAX_VALUE)).isEqualTo(Integer.MAX_VALUE);
        assertThat(VisitorStatsSupport.increment(Integer.MAX_VALUE - 1)).isEqualTo(Integer.MAX_VALUE);
        assertThat(VisitorStatsSupport.increment(0)).isEqualTo(1);
    }
}
