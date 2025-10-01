// src/MatchDataLoader.js (FINAL CORRECTED-AXIS VERSION)

export class MatchDataLoader {
  constructor(metadataUrl, trackingDataUrl) {
    this.metadataUrl = metadataUrl;
    this.trackingDataUrl = trackingDataUrl;
    this.trackableObjectMap = new Map();
    this.processedFrames = [];
    this.metadata = null;
  }

  async load() {
    try {
      const [metaResponse, trackResponse] = await Promise.all([
        fetch(this.metadataUrl),
        fetch(this.trackingDataUrl),
      ]);

      if (!metaResponse.ok)
        throw new Error(`Failed to load metadata: ${metaResponse.statusText}`);
      if (!trackResponse.ok)
        throw new Error(
          `Failed to load tracking data: ${trackResponse.statusText}`
        );

      this.metadata = await metaResponse.json();
      const trackingData = await trackResponse.json();

      this._process(this.metadata, trackingData);

      console.log(
        `✅ Loaded and processed ${this.processedFrames.length} frames.`
      );
      return this.processedFrames;
    } catch (error) {
      console.error("Error loading match data:", error);
      return [];
    }
  }

  _createMetadataMap(metadata) {
    const homeTeamName = metadata.home_team.name;
    const awayTeamName = metadata.away_team.name;
    const homeTeamId = metadata.home_team.id;

    metadata.players.forEach((p) => {
      this.trackableObjectMap.set(p.trackable_object, {
        id: `P${p.id}`,
        name: p.last_name || "Player",
        number: p.number,
        team: p.team_id === homeTeamId ? homeTeamName : awayTeamName,
      });
    });

    metadata.referees.forEach((r) => {
      this.trackableObjectMap.set(r.trackable_object, {
        id: `R${r.id}`,
        name: r.last_name || "Referee",
        team: "Referee",
      });
    });

    this.trackableObjectMap.set(55, {
      id: "Ball",
      name: "Ball",
      team: "Ball",
    });
  }

  _process(metadata, trackingData) {
    this._createMetadataMap(metadata);

    this.processedFrames = trackingData.map((rawFrame) => {
      const playersInFrame = [];

      for (const trackedObj of rawFrame.data) {
        const entityInfo = this.trackableObjectMap.get(
          trackedObj.trackable_object
        );

        if (entityInfo) {
          playersInFrame.push({
            id: entityInfo.id,
            name: entityInfo.name,
            team: entityInfo.team,
            // --- THIS IS THE FIX ---
            // We multiply the incoming x-coordinate by -1 to flip the axis.
            x: -trackedObj.x * 100,
            y: --trackedObj.y * 100,
          });
        }
      }

      return {
        frame_num: rawFrame.frame,
        frame_time_ms: this._parseTimestampToMs(rawFrame.time),
        players: playersInFrame,
      };
    });
  }

  _parseTimestampToMs(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(":");
    const minutes = parseInt(parts[0], 10);
    const seconds = parseFloat(parts[1]);
    return (minutes * 60 + seconds) * 1000;
  }
}
