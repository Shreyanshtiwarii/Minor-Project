package com.greenmove.config;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class RateLimitingService {

    private final Map<String, Bucket> searchBuckets = new ConcurrentHashMap<>();
    private final Map<String, Bucket> joinBuckets = new ConcurrentHashMap<>();

    // 20 searches per minute per user
    public Bucket resolveSearchBucket(String userId) {
        return searchBuckets.computeIfAbsent(userId, k -> Bucket.builder()
                .addLimit(Bandwidth.classic(20, Refill.intervally(20, Duration.ofMinutes(1))))
                .build());
    }

    // 5 joins per minute per user
    public Bucket resolveJoinBucket(String userId) {
        return joinBuckets.computeIfAbsent(userId, k -> Bucket.builder()
                .addLimit(Bandwidth.classic(5, Refill.intervally(5, Duration.ofMinutes(1))))
                .build());
    }
}
