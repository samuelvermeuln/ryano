/**
 * SAM-74 — activity file parsers against the official formats (§21.6):
 * GPX 1.1 and TCX v2 samples written per their schemas, a FIT file encoded
 * with Garmin's own SDK encoder, and the failure modes the athlete sees.
 */
import { Encoder, Profile } from "@garmin/fitsdk";
import { describe, expect, it } from "vitest";

import { ActivityFileError, parseActivityFile } from "@/modules/file-import/parsers/parse-activity-file";

const GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Ryvano test" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata><time>2026-09-20T07:00:00Z</time></metadata>
  <trk><name>Corrida</name><type>running</type><trkseg>
    <trkpt lat="-23.5500" lon="-46.6300"><ele>760</ele><time>2026-09-20T07:00:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>120</gpxtpx:hr><gpxtpx:cad>80</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions></trkpt>
    <trkpt lat="-23.5509" lon="-46.6300"><ele>762</ele><time>2026-09-20T07:00:20Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>135</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
    <trkpt lat="-23.5518" lon="-46.6300"><ele>764</ele><time>2026-09-20T07:00:40Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>142</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
  </trkseg></trk>
</gpx>`;

const TCX = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
  <Activities><Activity Sport="Running"><Id>2026-09-21T06:30:00Z</Id>
    <Lap StartTime="2026-09-21T06:30:00Z"><TotalTimeSeconds>300</TotalTimeSeconds><DistanceMeters>1000</DistanceMeters><Calories>60</Calories><AverageHeartRateBpm><Value>140</Value></AverageHeartRateBpm><Intensity>Active</Intensity><TriggerMethod>Distance</TriggerMethod>
      <Track>
        <Trackpoint><Time>2026-09-21T06:30:00Z</Time><Position><LatitudeDegrees>-23.55</LatitudeDegrees><LongitudeDegrees>-46.63</LongitudeDegrees></Position><AltitudeMeters>760</AltitudeMeters><DistanceMeters>0</DistanceMeters><HeartRateBpm><Value>120</Value></HeartRateBpm><Extensions><ns3:TPX><ns3:Speed>3.3</ns3:Speed></ns3:TPX></Extensions></Trackpoint>
        <Trackpoint><Time>2026-09-21T06:32:30Z</Time><DistanceMeters>500</DistanceMeters><HeartRateBpm><Value>145</Value></HeartRateBpm><Extensions><ns3:TPX><ns3:Speed>3.3</ns3:Speed><ns3:Watts>250</ns3:Watts></ns3:TPX></Extensions></Trackpoint>
        <Trackpoint><Time>2026-09-21T06:35:00Z</Time><DistanceMeters>1000</DistanceMeters><HeartRateBpm><Value>150</Value></HeartRateBpm></Trackpoint>
      </Track></Lap>
    <Lap StartTime="2026-09-21T06:35:00Z"><TotalTimeSeconds>290</TotalTimeSeconds><DistanceMeters>1000</DistanceMeters><Calories>60</Calories><AverageHeartRateBpm><Value>152</Value></AverageHeartRateBpm><Intensity>Active</Intensity><TriggerMethod>Distance</TriggerMethod>
      <Track><Trackpoint><Time>2026-09-21T06:39:50Z</Time><DistanceMeters>2000</DistanceMeters></Trackpoint></Track></Lap>
  </Activity></Activities>
</TrainingCenterDatabase>`;

const bytes = (text: string) => new TextEncoder().encode(text);

/** A pool swim encoded with Garmin's SDK encoder: file_id, session (25 m pool), two laps and records. */
function fitPoolSwim(): Uint8Array {
  const start = new Date("2026-09-22T06:00:00Z");
  const encoder = new Encoder();
  // The SDK types `Mesg` loosely; the fields follow Profile.xlsx (file_id, session, lap, record).
  const mesg = (fields: Record<string, unknown>) => fields as never;
  encoder.onMesg(Profile.MesgNum.FILE_ID, mesg({ type: "activity", manufacturer: "development", product: 0, timeCreated: start, serialNumber: 1 }));
  encoder.onMesg(Profile.MesgNum.SESSION, mesg({
    timestamp: new Date(start.getTime() + 1200_000), startTime: start, sport: "swimming", subSport: "lapSwimming",
    totalElapsedTime: 1200, totalTimerTime: 1150, totalDistance: 1000, poolLength: 25, poolLengthUnit: "metric",
  }));
  for (let second = 0; second <= 1200; second += 60) {
    encoder.onMesg(Profile.MesgNum.RECORD, mesg({ timestamp: new Date(start.getTime() + second * 1000), distance: (second / 1200) * 1000, heartRate: 130 + (second % 120 === 0 ? 5 : 0) }));
  }
  encoder.onMesg(Profile.MesgNum.LAP, mesg({ timestamp: new Date(start.getTime() + 600_000), startTime: start, totalElapsedTime: 600, totalTimerTime: 580, totalDistance: 500, avgHeartRate: 132 }));
  encoder.onMesg(Profile.MesgNum.LAP, mesg({ timestamp: new Date(start.getTime() + 1200_000), startTime: new Date(start.getTime() + 600_000), totalElapsedTime: 600, totalTimerTime: 570, totalDistance: 500, avgHeartRate: 138 }));
  return encoder.close();
}

describe("GPX 1.1", () => {
  it("corrida: pontos com horário, FC e cadência da extensão; distância reconstruída pelo traçado", () => {
    const parsed = parseActivityFile("corrida.gpx", bytes(GPX));
    expect(parsed.format).toBe("GPX");
    expect(parsed.activity).toMatchObject({ sportType: "run", providerSportType: "running", durationSeconds: 40, averageHeartRate: 132, maxHeartRate: 142 });
    expect(parsed.activity.startedAt.toISOString()).toBe("2026-09-20T07:00:00.000Z");
    expect(parsed.activity.distanceMeters).toBeGreaterThan(190);
    expect(parsed.activity.distanceMeters).toBeLessThan(210);
    const keys = parsed.detail.streams.map((stream) => stream.key);
    expect(keys).toEqual(expect.arrayContaining(["time", "distance", "latlng", "altitude", "heartRate", "cadence"]));
    expect(parsed.detail.streams.find((stream) => stream.key === "cadence")!.values).toEqual([80, null, null]);
  });
});

describe("TCX v2", () => {
  it("corrida com duas voltas, FC e TPX: voltas, séries e totais pelo somatório das voltas", () => {
    const parsed = parseActivityFile("corrida.tcx", bytes(TCX));
    expect(parsed.format).toBe("TCX");
    expect(parsed.activity).toMatchObject({ sportType: "run", providerSportType: "Running", durationSeconds: 590, distanceMeters: 2000, averagePower: 250 });
    expect(parsed.detail.laps.map((lap) => [lap.durationSeconds, lap.distanceMeters, lap.averageHeartRate])).toEqual([[300, 1000, 140], [290, 1000, 152]]);
    expect(parsed.detail.streams.find((stream) => stream.key === "power")!.values).toEqual([null, 250, null, null]);
    expect(parsed.detail.streams.find((stream) => stream.key === "latlng")!.values[1]).toBeNull();
  });
});

describe("FIT (SDK oficial)", () => {
  it("natação em piscina de 25 m: sessão, voltas, registros e comprimento da piscina", () => {
    const parsed = parseActivityFile("nado.fit", fitPoolSwim());
    expect(parsed.format).toBe("FIT");
    expect(parsed.activity).toMatchObject({ sportType: "swim", durationSeconds: 1200, movingSeconds: 1150, distanceMeters: 1000 });
    expect(parsed.poolLengthMeters).toBe(25);
    expect(parsed.detail.laps).toHaveLength(2);
    expect(parsed.detail.laps[1]).toMatchObject({ lapNumber: 2, distanceMeters: 500, averageHeartRate: 138 });
    expect(parsed.detail.streams.find((stream) => stream.key === "time")!.values).toHaveLength(21);
    expect(parsed.detail.streams.some((stream) => stream.key === "latlng")).toBe(false);
  });
});

describe("falhas compreensíveis (§18.3)", () => {
  it("formato não suportado, XML sem pontos e FIT corrompido viram mensagens claras", () => {
    expect(() => parseActivityFile("foto.jpg", bytes("ÿØÿ"))).toThrow(ActivityFileError);
    expect(() => parseActivityFile("foto.jpg", bytes("ÿØÿ"))).toThrow(/Formato não suportado/);
    expect(() => parseActivityFile("vazio.gpx", bytes('<gpx version="1.1" creator="x"><trk/></gpx>'))).toThrow(/não tem pontos com horário/);
    const corrupted = fitPoolSwim();
    corrupted[corrupted.length - 1] = corrupted[corrupted.length - 1]! ^ 0xff;
    expect(() => parseActivityFile("nado.fit", corrupted)).toThrow(/corrompido/);
  });
});
