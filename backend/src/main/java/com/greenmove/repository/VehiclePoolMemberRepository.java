package com.greenmove.repository;

import com.greenmove.entity.VehiclePoolMemberEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface VehiclePoolMemberRepository extends JpaRepository<VehiclePoolMemberEntity, String> {

    Optional<VehiclePoolMemberEntity> findByPoolIdAndUserId(String poolId, String userId);

    List<VehiclePoolMemberEntity> findByPoolId(String poolId);

    List<VehiclePoolMemberEntity> findByUserId(String userId);

    void deleteByPoolIdAndUserId(String poolId, String userId);

    long countByPoolId(String poolId);
}
