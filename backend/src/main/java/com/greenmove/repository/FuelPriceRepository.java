package com.greenmove.repository;

import com.greenmove.entity.FuelPriceEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface FuelPriceRepository extends JpaRepository<FuelPriceEntity, String> {
}
