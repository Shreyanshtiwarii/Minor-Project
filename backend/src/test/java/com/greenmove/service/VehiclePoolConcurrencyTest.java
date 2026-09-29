package com.greenmove.service;

import com.greenmove.entity.UserEntity;
import com.greenmove.entity.VehiclePoolEntity;
import com.greenmove.service.VehiclePoolService.PoolException;
import com.greenmove.repository.UserRepository;
import com.greenmove.repository.VehiclePoolMemberRepository;
import com.greenmove.repository.VehiclePoolRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.*;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
public class VehiclePoolConcurrencyTest {

    @Autowired
    private VehiclePoolService vehiclePoolService;

    @Autowired
    private VehiclePoolRepository poolRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private VehiclePoolMemberRepository memberRepository;

    @BeforeEach
    public void setUp() {
        memberRepository.deleteAll();
        poolRepository.deleteAll();
        userRepository.deleteAll();

        UserEntity driver = new UserEntity();
        driver.setId("driver");
        driver.setName("Driver");
        driver.setEmail("driver@test.com");
        driver.setPasswordHash("pass");
        driver.setRole("USER");
        driver.setAuthProvider("LOCAL");
        driver.setStatus("ACTIVE");
        userRepository.save(driver);

        for (int i = 0; i < 5; i++) {
            UserEntity p = new UserEntity();
            p.setId("passenger_" + i);
            p.setName("Passenger " + i);
            p.setEmail("passenger" + i + "@test.com");
            p.setPasswordHash("pass");
            p.setRole("USER");
            p.setAuthProvider("LOCAL");
            p.setStatus("ACTIVE");
            userRepository.save(p);
        }
    }

    private String createPool(int seats) {
        VehiclePoolEntity pool = new VehiclePoolEntity();
        pool.setId("pool_" + System.currentTimeMillis());
        pool.setCreatorId("driver");
        pool.setCreatorName("Driver");
        pool.setStartLocation("A");
        pool.setDestination("B");
        pool.setDepartureTime(LocalDateTime.now().plusDays(1));
        pool.setTotalSeats(seats);
        pool.setAvailableSeats(seats);
        pool.setCostPerPassenger(10.0);
        pool.setTotalCost(10.0);
        pool.setStatus("ACTIVE");
        return poolRepository.save(pool).getId();
    }

    @Test
    public void testA_TwoUsersOneSeat() throws Exception {
        String poolId = createPool(1);
        
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch latch = new CountDownLatch(1);
        
        Callable<Boolean> task1 = () -> {
            latch.await();
            try {
                vehiclePoolService.joinPool("passenger_0", poolId, null);
                return true;
            } catch (PoolException e) {
                return false;
            }
        };
        
        Callable<Boolean> task2 = () -> {
            latch.await();
            try {
                vehiclePoolService.joinPool("passenger_1", poolId, null);
                return true;
            } catch (PoolException e) {
                return false;
            }
        };
        
        Future<Boolean> f1 = executor.submit(task1);
        Future<Boolean> f2 = executor.submit(task2);
        
        latch.countDown();
        
        boolean res1 = f1.get();
        boolean res2 = f2.get();
        
        assertTrue(res1 ^ res2);
        
        VehiclePoolEntity updated = poolRepository.findById(poolId).orElseThrow();
        assertEquals(0, updated.getAvailableSeats());
        assertEquals(1, memberRepository.findByPoolId(poolId).size());
        
        executor.shutdown();
    }

    @Test
    public void testB_FiveUsersThreeSeats() throws Exception {
        String poolId = createPool(3);
        
        ExecutorService executor = Executors.newFixedThreadPool(5);
        CountDownLatch latch = new CountDownLatch(1);
        
        List<Future<Boolean>> futures = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            final String userId = "passenger_" + i;
            futures.add(executor.submit(() -> {
                latch.await();
                try {
                    vehiclePoolService.joinPool(userId, poolId, null);
                    return true;
                } catch (PoolException e) {
                    return false;
                }
            }));
        }
        
        latch.countDown();
        
        int successes = 0;
        for (Future<Boolean> f : futures) {
            if (f.get()) successes++;
        }
        
        assertEquals(3, successes);
        
        VehiclePoolEntity updated = poolRepository.findById(poolId).orElseThrow();
        assertEquals(0, updated.getAvailableSeats());
        assertEquals(3, memberRepository.findByPoolId(poolId).size());
        
        executor.shutdown();
    }

    @Test
    public void testD_SameUserConcurrentDuplicateJoin() throws Exception {
        String poolId = createPool(3);
        
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch latch = new CountDownLatch(1);
        
        Callable<Boolean> task = () -> {
            latch.await();
            try {
                vehiclePoolService.joinPool("passenger_0", poolId, null);
                return true;
            } catch (Exception e) {
                return false;
            }
        };
        
        Future<Boolean> f1 = executor.submit(task);
        Future<Boolean> f2 = executor.submit(task);
        
        latch.countDown();
        
        boolean res1 = f1.get();
        boolean res2 = f2.get();
        
        assertTrue(res1 ^ res2);
        
        VehiclePoolEntity updated = poolRepository.findById(poolId).orElseThrow();
        assertEquals(2, updated.getAvailableSeats());
        assertEquals(1, memberRepository.findByPoolId(poolId).size());
        
        executor.shutdown();
    }
    
    @Test
    public void testC_TwoUsersZeroSeats() throws Exception {
        String poolId = createPool(0);
        
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch latch = new CountDownLatch(1);
        
        Callable<Boolean> task1 = () -> {
            latch.await();
            try {
                vehiclePoolService.joinPool("passenger_0", poolId, null);
                return true;
            } catch (PoolException e) {
                return false;
            }
        };
        
        Callable<Boolean> task2 = () -> {
            latch.await();
            try {
                vehiclePoolService.joinPool("passenger_1", poolId, null);
                return true;
            } catch (PoolException e) {
                return false;
            }
        };
        
        Future<Boolean> f1 = executor.submit(task1);
        Future<Boolean> f2 = executor.submit(task2);
        
        latch.countDown();
        
        assertFalse(f1.get());
        assertFalse(f2.get());
        
        VehiclePoolEntity updated = poolRepository.findById(poolId).orElseThrow();
        assertEquals(0, updated.getAvailableSeats());
        assertEquals(0, memberRepository.findByPoolId(poolId).size());
        
        executor.shutdown();
    }
}
