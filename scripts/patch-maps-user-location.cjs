/**
 * react-native-maps + Fabric:
 * `topUserLocationChange` が customDirectEventTypes 未登録のまま dispatch され
 * ReactFabric が Uncaught Error になる問題を防ぐ。
 *
 * - ReactFabric(*.js): 当該イベントを無視（Metro リロードだけで実機に効く）
 * - maps ネイティブ: 位置イベントを発火しない（再ビルド後に完全停止）
 * - MapView.tsx: showsUserLocation を常時 false
 *
 * npm install 後に自動実行（package.json postinstall）。
 */
const fs = require('fs');
const path = require('path');

function patchContents(target, apply) {
  if (!fs.existsSync(target)) return;
  const original = fs.readFileSync(target, 'utf8');
  const next = apply(original);
  if (next != null && next !== original) {
    fs.writeFileSync(target, next);
  }
}

const root = path.join(__dirname, '..', 'node_modules');

// ---------------------------------------------------------------------------
// 1) ReactFabric: unsupported topUserLocationChange を throw せず無視
// ---------------------------------------------------------------------------
function patchReactFabric(filePath) {
  patchContents(filePath, (src) => {
    if (src.includes('spottoIgnoreMapsUserLocationEvent')) return src;

    const patterns = [
      {
        needle: `if (!bubbleDispatchConfig && !directDispatchConfig)
            throw Error(
              'Unsupported top level event type "' +
                topLevelType +
                '" dispatched'
            );`,
        replacement: `if (!bubbleDispatchConfig && !directDispatchConfig) {
            // spottoIgnoreMapsUserLocationEvent: react-native-maps Fabric mismatch
            if (
              topLevelType === 'topUserLocationChange' ||
              topLevelType === 'topuserlocationchange'
            ) {
              return null;
            }
            throw Error(
              'Unsupported top level event type "' +
                topLevelType +
                '" dispatched'
            );
          }`,
      },
      {
        needle: `if (!bubbleDispatchConfig && !directDispatchConfig)
          throw Error(
            'Unsupported top level event type "' + topLevelType + '" dispatched'
          );`,
        replacement: `if (!bubbleDispatchConfig && !directDispatchConfig) {
          // spottoIgnoreMapsUserLocationEvent: react-native-maps Fabric mismatch
          if (
            topLevelType === 'topUserLocationChange' ||
            topLevelType === 'topuserlocationchange'
          ) {
            return null;
          }
          throw Error(
            'Unsupported top level event type "' + topLevelType + '" dispatched'
          );
        }`,
      },
    ];

    let next = src;
    for (const { needle, replacement } of patterns) {
      if (next.includes(needle)) {
        next = next.replace(needle, replacement);
      }
    }
    return next;
  });
}

const rendererDir = path.join(
  root,
  'react-native',
  'Libraries',
  'Renderer',
  'implementations',
);
for (const name of [
  'ReactFabric-dev.js',
  'ReactFabric-prod.js',
  'ReactFabric-profiling.js',
]) {
  patchReactFabric(path.join(rendererDir, name));
}

// ---------------------------------------------------------------------------
// 2) Android: ユーザー位置リスナーを無効化（常に no-op）
// ---------------------------------------------------------------------------
patchContents(
  path.join(
    root,
    'react-native-maps',
    'android/src/main/java/com/rnmaps/maps/MapView.java',
  ),
  (src) => {
    if (src.includes('// spotto: disable user location listener')) {
      return src;
    }
    // 既存ガード付き版も含め、リスナー本体を置き換える
    const guarded = `        map.setOnMyLocationChangeListener(new GoogleMap.OnMyLocationChangeListener() {
            @Override
            public void onMyLocationChange(Location location) {
                // spotto: guard user location event (Fabric topUserLocationChange crash)
                if (!showUserLocation) {
                    return;
                }
                WritableMap event = new WritableNativeMap();

                WritableMap coordinate = new WritableNativeMap();
                coordinate.putDouble("latitude", location.getLatitude());
                coordinate.putDouble("longitude", location.getLongitude());
                coordinate.putDouble("altitude", location.getAltitude());
                coordinate.putDouble("timestamp", location.getTime());
                coordinate.putDouble("accuracy", location.getAccuracy());
                coordinate.putDouble("speed", location.getSpeed());
                coordinate.putDouble("heading", location.getBearing());
                coordinate.putBoolean("isFromMockProvider", location.isFromMockProvider());

                event.putMap("coordinate", coordinate);
                dispatchEvent(event, OnUserLocationChangeEvent::new);
            }
        });`;

    const original = `        map.setOnMyLocationChangeListener(new GoogleMap.OnMyLocationChangeListener() {
            @Override
            public void onMyLocationChange(Location location) {
                WritableMap event = new WritableNativeMap();

                WritableMap coordinate = new WritableNativeMap();
                coordinate.putDouble("latitude", location.getLatitude());
                coordinate.putDouble("longitude", location.getLongitude());
                coordinate.putDouble("altitude", location.getAltitude());
                coordinate.putDouble("timestamp", location.getTime());
                coordinate.putDouble("accuracy", location.getAccuracy());
                coordinate.putDouble("speed", location.getSpeed());
                coordinate.putDouble("heading", location.getBearing());
                coordinate.putBoolean("isFromMockProvider", location.isFromMockProvider());

                event.putMap("coordinate", coordinate);
                dispatchEvent(event, OnUserLocationChangeEvent::new);
            }
        });`;

    const disabled = `        // spotto: disable user location listener (Fabric topUserLocationChange crash)
        map.setOnMyLocationChangeListener(null);`;

    if (src.includes(guarded)) return src.replace(guarded, disabled);
    if (src.includes(original)) return src.replace(original, disabled);
    return src;
  },
);

// ---------------------------------------------------------------------------
// 3) iOS Google Maps: myLocation KVO でイベントを飛ばさない
// ---------------------------------------------------------------------------
patchContents(
  path.join(
    root,
    'react-native-maps',
    'ios/AirGoogleMaps/AIRGoogleMap.mm',
  ),
  (src) => {
    if (src.includes('// spotto: disable user location event')) return src;

    const alreadyGuarded = `  if ([keyPath isEqualToString:@"myLocation"]){
    // spotto: guard user location event (Fabric topUserLocationChange crash)
    if (!self.myLocationEnabled) {
      return;
    }
    CLLocation *location = [object myLocation];
    if (location == nil) {
      return;
    }

    id event = @{@"coordinate": @{
                    @"latitude": @(location.coordinate.latitude),
                    @"longitude": @(location.coordinate.longitude),
                    @"altitude": @(location.altitude),
                    @"timestamp": @(location.timestamp.timeIntervalSince1970 * 1000),
                    @"accuracy": @(location.horizontalAccuracy),
                    @"altitudeAccuracy": @(location.verticalAccuracy),
                    @"speed": @(location.speed),
                    @"heading": @(location.course),
                    }
                };

  if (self.onUserLocationChange) self.onUserLocationChange(event);
  } else {`;

    const original = `  if ([keyPath isEqualToString:@"myLocation"]){
    CLLocation *location = [object myLocation];

    id event = @{@"coordinate": @{
                    @"latitude": @(location.coordinate.latitude),
                    @"longitude": @(location.coordinate.longitude),
                    @"altitude": @(location.altitude),
                    @"timestamp": @(location.timestamp.timeIntervalSince1970 * 1000),
                    @"accuracy": @(location.horizontalAccuracy),
                    @"altitudeAccuracy": @(location.verticalAccuracy),
                    @"speed": @(location.speed),
                    @"heading": @(location.course),
                    }
                };

  if (self.onUserLocationChange) self.onUserLocationChange(event);
  } else {`;

    const disabled = `  if ([keyPath isEqualToString:@"myLocation"]){
    // spotto: disable user location event (Fabric topUserLocationChange crash)
    return;
  } else {`;

    if (src.includes(alreadyGuarded)) return src.replace(alreadyGuarded, disabled);
    if (src.includes(original)) return src.replace(original, disabled);
    return src;
  },
);

// ---------------------------------------------------------------------------
// 4) iOS Apple Maps: didUpdateUserLocation を無視
// ---------------------------------------------------------------------------
patchContents(
  path.join(root, 'react-native-maps', 'ios/AirMaps/AIRMapManager.m'),
  (src) => {
    if (src.includes('// spotto: disable user location event')) return src;

    const alreadyGuarded = `- (void)mapView:(AIRMap *)mapView didUpdateUserLocation:(MKUserLocation *)location
{
    // spotto: guard user location event (Fabric topUserLocationChange crash)
    if (!mapView.showsUserLocation) {
        return;
    }
    id event = @{@"coordinate": @{`;

    const original = `- (void)mapView:(AIRMap *)mapView didUpdateUserLocation:(MKUserLocation *)location
{
    id event = @{@"coordinate": @{`;

    const disabled = `- (void)mapView:(AIRMap *)mapView didUpdateUserLocation:(MKUserLocation *)location
{
    // spotto: disable user location event (Fabric topUserLocationChange crash)
    if (mapView.followsUserLocation) {
        [mapView setCenterCoordinate:location.coordinate animated:YES];
    }
    return;
    id event = @{@"coordinate": @{`;

    if (src.includes(alreadyGuarded)) return src.replace(alreadyGuarded, disabled);
    if (src.includes(original)) return src.replace(original, disabled);
    return src;
  },
);

// ---------------------------------------------------------------------------
// 5) JS MapView: ネイティブ現在地を常時オフ
// ---------------------------------------------------------------------------
patchContents(
  path.join(root, 'react-native-maps', 'src/MapView.tsx'),
  (src) => {
    if (src.includes('// spotto: force disable native user location')) return src;
    const needle = `    const props: MapFabricNativeProps = {
      onMapReady: this._onMapReady,`;
    const replacement = `    // spotto: force disable native user location (Fabric topUserLocationChange crash)
    delete (restProps as {showsUserLocation?: boolean}).showsUserLocation;
    delete (restProps as {onUserLocationChange?: unknown}).onUserLocationChange;
    delete (restProps as {followsUserLocation?: boolean}).followsUserLocation;
    const props: MapFabricNativeProps = {
      showsUserLocation: false,
      showsMyLocationButton: false,
      followsUserLocation: false,
      onMapReady: this._onMapReady,`;
    if (!src.includes(needle)) return src;
    return src.replace(needle, replacement);
  },
);

// lib 配下のビルド成果物は react-native エントリが src/ のため不要
