package com.greenmove.repository;

import com.greenmove.entity.JourneyEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface JourneyRepository extends JpaRepository<JourneyEntity, String> {
    List<JourneyEntity> findByUserIdNot(String userId);
    List<JourneyEntity> findByUserId(String userId);

    @Query("SELECT COALESCE(SUM(j.co2Kg), 0.0) FROM JourneyEntity j")
    Double sumCo2SavedKg();

    @Query("SELECT COUNT(j) FROM JourneyEntity j WHERE LOWER(j.mode) LIKE '%carpool%'")
    Long countCarpoolJourneys();
}
