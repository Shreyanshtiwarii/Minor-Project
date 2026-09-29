package com.greenmove.provider;

import com.greenmove.dto.EVStationDTO;
import com.greenmove.dto.RoutingRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
public class TomTomEVProvider implements EVChargingProvider {

    private static final Logger log = LoggerFactory.getLogger(TomTomEVProvider.class);

    @Override
    public String getProviderName() {
        return "TomTomEV";
    }

    @Override
    public List<EVStationDTO> fetchRawStationsNearRoute(List<RoutingRequest.Coordinate> routeWaypoints, double searchRadiusKm) {
        log.info("TomTom EV Search Along Route is currently restricted to private preview. Returning isolated empty list until access is granted.");
        return new ArrayList<>();
    }
}
