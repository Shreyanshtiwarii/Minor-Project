package com.greenmove.repository;

import com.greenmove.entity.EmissionFactorEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface EmissionFactorRepository extends JpaRepository<EmissionFactorEntity, String> {
}
