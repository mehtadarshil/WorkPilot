import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

class LocationResult {
  final double? latitude;
  final double? longitude;

  LocationResult({this.latitude, this.longitude});
}

Future<LocationResult> getCurrentLocation() async {
  try {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      return LocationResult();
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        return LocationResult();
      }
    }

    if (permission == LocationPermission.deniedForever) {
      return LocationResult();
    }

    final position = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: Duration(seconds: 5),
      ),
    );
    return LocationResult(
      latitude: position.latitude,
      longitude: position.longitude,
    );
  } catch (e) {
    debugPrint('Error getting location: $e');
    return LocationResult();
  }
}
