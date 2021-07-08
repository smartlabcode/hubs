// We apply the parameters that dim the audio the most
function paramsReducer(acc, curr) {
  if (acc === null) acc = curr;
  acc.gain = Math.min(acc.gain, curr.gain);
  acc.maxDistance = Math.min(acc.maxDistance, curr.maxDistance);
  acc.refDistance = Math.min(acc.refDistance, curr.refDistance);
  acc.rolloffFactor = Math.max(acc.rolloffFactor, curr.rolloffFactor);
  acc.coneInnerAngle = Math.min(acc.coneInnerAngle, curr.coneInnerAngle);
  acc.coneOuterAngle = Math.min(acc.coneOuterAngle, curr.coneOuterAngle);
  acc.coneOuterGain = Math.min(acc.coneOuterGain, curr.coneOuterGain);
  return acc;
}

// This system updates the audio-zone-sources audio parameters based on the listener's position.
// If several audio-zones are in between the audio-zone-listener and the audio-zone-source, the applied audio parameters is a reduction
// of the auzio-zones most restrictive audio parameters.
// i.e. If there are two audio-zones in between the listener and the source and the first one has gain == 0.1
// and the other has gain == 1.0, gain == 0.1 is applied to the source.
export class AudioZonesSystem {
  constructor(scene) {
    this.scene = scene;
    this.listener = null;
    this.sources = [];
    this.zones = [];
    this.initialized = false;
    this.ray = new THREE.Ray();
    this.rayDir = new THREE.Vector3();
    this.normalizedRayDir = new THREE.Vector3();
    this.intersectTarget = new THREE.Vector3();
  }

  remove() {
    this.sources = [];
    this.zones = [];
  }

  setListener(listener) {
    this.listener = listener;
  }

  unsetListener() {
    this.listener = null;
  }

  registerSource(source) {
    this.sources.push(source);
  }

  unregisterSource(source) {
    const index = this.sources.indexOf(source);

    if (index !== -1) {
      this.sources.splice(index, 1);
    }
  }

  registerZone(zone) {
    this.zones.push(zone);
  }

  unregisterZone(zone) {
    const index = this.zones.indexOf(zone);

    if (index !== -1) {
      this.zones.splice(index, 1);
    }
  }

  tick() {
    if (!this.scene.is("entered") || this.zones.length === 0) return;

    // Update zones
    this._updateZones();

    this.sources.forEach(source => {
      // Only check whenever either the source or the listener have updated zones (moved)
      if (source.entity.isUpdated() || this.listener.entity.isUpdated()) {
        // Cast a ray from the listener to the source
        this.rayDir = source
          .getPosition()
          .clone()
          .sub(this.listener.getPosition());
        this.normalizedRayDir = this.rayDir.clone().normalize();
        this.ray.set(this.listener.getPosition(), this.normalizedRayDir);

        // First we check the zones the source is contained in and we check the inOut property
        // to modify the sources audio params when the listener is outside the source's zones
        // We always apply the outmost active zone audio params, the zone that's closest to the listener
        const inOutParams = source.entity
          .getZones()
          .filter(zone => {
            const zoneBBAA = zone.getBoundingBox();
            this.intersectTarget = new THREE.Vector3();
            this.ray.intersectBox(zoneBBAA, this.intersectTarget);
            return this.intersectTarget !== null && zone.data.inOut && !this.listener.entity.getZones().includes(zone);
          })
          .map(zone => zone.getAudioParams())
          .reduce(paramsReducer, null);

        // Then we check the zones the listener is contained in and we check the outIn property
        // to modify the sources audio params when the source is outside the listener's zones
        // We always apply the inmost active zone audio params, the zone that's closest to the listener
        const outInParams = this.listener.entity
          .getZones()
          .filter(zone => {
            const zoneBBAA = zone.getBoundingBox();
            this.intersectTarget = new THREE.Vector3();
            this.ray.intersectBox(zoneBBAA, this.intersectTarget);
            return this.intersectTarget !== null && zone.data.outIn && !source.entity.getZones().includes(zone);
          })
          .map(zone => zone.getAudioParams())
          .reduce(paramsReducer, null);

        // Resolve the zones
        if (outInParams || inOutParams) {
          const params = outInParams ? outInParams : inOutParams;
          params.gain = outInParams && inOutParams ? Math.min(outInParams.gain, inOutParams.gain) : params.gain;
          params.coneOuterGain =
            outInParams && inOutParams
              ? Math.min(outInParams.coneOuterGain, inOutParams.coneOuterGain)
              : params.coneOuterGain;
          source.apply(params);
        } else {
          source.restore();
        }
      }
    });
  }

  _updateZones() {
    this.zones.forEach(zone => {
      if (!zone.isEnabled()) return;

      const isListenerInZone = zone.contains(this.listener.getPosition());
      const wasListenerInZone = this.listener.entity.isInZone(zone);
      // Update audio zone listener status
      if (isListenerInZone && !wasListenerInZone) {
        this.listener.entity.addZone(zone);
      } else if (!isListenerInZone && wasListenerInZone) {
        this.listener.entity.removeZone(zone);
      }
      // Update audio zone source status
      this.sources.forEach(source => {
        const isSourceInZone = zone.contains(source.getPosition());
        const wasSourceInZone = source.entity.isInZone(zone);
        // Check if the audio source is in the audio zone
        if (isSourceInZone && !wasSourceInZone) {
          source.entity.addZone(zone);
        } else if (!isSourceInZone && wasSourceInZone) {
          source.entity.removeZone(zone);
        }
      });
    });
  }
}
