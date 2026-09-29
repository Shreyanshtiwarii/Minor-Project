package com.greenmove.provider;

import com.greenmove.dto.EVStationDTO;
import com.greenmove.dto.RoutingRequest;

import java.util.List;

public interface EVChargingProvider {
    String getProviderName();
    List<EVStationDTO> fetchRawStationsNearRoute(List<RoutingRequest.Coordinate> routeWaypoints, double searchRadiusKm);
}
