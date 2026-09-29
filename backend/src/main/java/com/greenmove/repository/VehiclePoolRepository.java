package com.greenmove.repository;

import com.greenmove.entity.VehiclePoolEntity;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface VehiclePoolRepository extends JpaRepository<VehiclePoolEntity, String> {

    public interface SpatialCandidateProjection {
        String getPoolId();
        Double getPickupDistanceMeters();
        Double getDropoffDistanceMeters();
        Double getPickupRoutePosition();
        Double getDropoffRoutePosition();
    }

    List<VehiclePoolEntity> findAllByOrderByDepartureTimeAsc();

    List<VehiclePoolEntity> findByCreatorIdOrderByDepartureTimeAsc(String creatorId);

    List<VehiclePoolEntity> findByStatusAndAvailableSeatsGreaterThanOrderByDepartureTimeAsc(
            String status, Integer availableSeats);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM VehiclePoolEntity p WHERE p.id = :id")
    Optional<VehiclePoolEntity> findByIdForUpdate(@Param("id") String id);

    @Query(value = """
            SELECT p.id AS poolId,
                   ST_Distance(p.route_geom::geography, ST_SetSRID(ST_MakePoint(:pickupLng, :pickupLat), 4326)::geography) AS pickupDistanceMeters,
                   ST_Distance(p.route_geom::geography, ST_SetSRID(ST_MakePoint(:dropoffLng, :dropoffLat), 4326)::geography) AS dropoffDistanceMeters,
                   ST_LineLocatePoint(p.route_geom, ST_SetSRID(ST_MakePoint(:pickupLng, :pickupLat), 4326)) AS pickupRoutePosition,
                   ST_LineLocatePoint(p.route_geom, ST_SetSRID(ST_MakePoint(:dropoffLng, :dropoffLat), 4326)) AS dropoffRoutePosition
            FROM vehicle_pool p
            WHERE p.status = 'ACTIVE'
              AND p.available_seats > 0
              AND p.departure_time > :now
              AND p.route_geom IS NOT NULL
              AND ST_DWithin(p.route_geom::geography, ST_SetSRID(ST_MakePoint(:pickupLng, :pickupLat), 4326)::geography, :maxDistanceMeters)
              AND ST_DWithin(p.route_geom::geography, ST_SetSRID(ST_MakePoint(:dropoffLng, :dropoffLat), 4326)::geography, :maxDistanceMeters)
            ORDER BY p.departure_time ASC
            LIMIT 100
            """, nativeQuery = true)
    List<SpatialCandidateProjection> findSpatialCandidates(
            @Param("pickupLat") double pickupLat,
            @Param("pickupLng") double pickupLng,
            @Param("dropoffLat") double dropoffLat,
            @Param("dropoffLng") double dropoffLng,
            @Param("maxDistanceMeters") double maxDistanceMeters,
            @Param("now") LocalDateTime now
    );

    public interface SegmentProjection {
        Double getSegmentDistanceMeters();
        String getSegmentGeomWkt();
    }

    @Query(value = """
            SELECT ST_Length(ST_LineSubstring(route_geom, :startFrac, :endFrac)::geography) AS segmentDistanceMeters,
                   ST_AsText(ST_LineSubstring(route_geom, :startFrac, :endFrac)) AS segmentGeomWkt
            FROM vehicle_pool
            WHERE id = :poolId
            """, nativeQuery = true)
    SegmentProjection getDriverSegment(
            @Param("poolId") String poolId,
            @Param("startFrac") double startFrac,
            @Param("endFrac") double endFrac
    );
}
