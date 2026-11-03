import { Quaternion, RaycastResult, RaycastVehicle, Vec3, type WheelInfo } from 'cannon-es';

// Sweep the lower tyre contour along the suspension axis. A centre ray alone
// misses the uphill shoulder and lets the tyre cut into banks and small crests.
// Include the centre first so a flat contact doesn't introduce an axle torque.
const tyreSamples = [{ across: 0, along: 0, down: 1 }];
for (let i = 0; i <= 8; i++) {
  const angle = -Math.PI / 2 + i * Math.PI / 8;
  for (const across of [0, -1, 1]) tyreSamples.push({ across, along: Math.sin(angle), down: Math.cos(angle) });
}

export class TerrainVehicle extends RaycastVehicle {
  private readonly probe = new RaycastResult();
  private readonly source = new Vec3();
  private readonly target = new Vec3();
  private readonly axle = new Vec3();
  private readonly rolling = new Vec3();
  private readonly up = new Vec3();
  private readonly velocity = new Vec3();
  private readonly steeringRotation = new Quaternion();

  constructor(options: ConstructorParameters<typeof RaycastVehicle>[0], private readonly wheelWidth: number) {
    super(options);
  }

  override castRay(wheel: WheelInfo) {
    this.updateWheelTransformWorld(wheel);
    const result = wheel.raycastResult;
    result.reset();
    let length = Infinity;
    const maxLength = wheel.suspensionRestLength + wheel.maxSuspensionTravel;
    const minLength = Math.max(0, wheel.suspensionRestLength - wheel.maxSuspensionTravel);
    wheel.directionLocal.negate(this.up);
    this.steeringRotation.setFromAxisAngle(this.up, wheel.steering);
    this.steeringRotation.vmult(wheel.axleLocal, this.axle);
    this.chassisBody.quaternion.vmult(this.axle, this.axle);
    wheel.directionWorld.cross(this.axle, this.rolling);
    const response = this.chassisBody.collisionResponse;
    this.chassisBody.collisionResponse = false;
    try {
      for (const sample of tyreSamples) {
        const across = sample.across * this.wheelWidth / 2;
        const along = sample.along * wheel.radius;
        const down = sample.down * wheel.radius;
        const origin = wheel.chassisConnectionPointWorld;
        this.source.set(origin.x + this.axle.x * across + this.rolling.x * along,
          origin.y + this.axle.y * across + this.rolling.y * along,
          origin.z + this.axle.z * across + this.rolling.z * along);
        wheel.directionWorld.scale(maxLength + down, this.target);
        this.target.vadd(this.source, this.target);
        this.probe.reset();
        this.world!.rayTest(this.source, this.target, this.probe);
        if (!this.probe.body || this.probe.hitNormalWorld.dot(wheel.directionWorld) >= -0.1) continue;
        const candidate = this.probe.distance - down;
        if (candidate >= length - 1e-6) continue;
        length = candidate;
        result.set(this.source, this.target, this.probe.hitNormalWorld, this.probe.hitPointWorld,
          this.probe.shape!, this.probe.body, this.probe.distance);
        result.hasHit = true;
        result.hitFaceIndex = this.probe.hitFaceIndex;
      }
    } finally {
      this.chassisBody.collisionResponse = response;
    }
    result.groundObject = 0;
    wheel.isInContact = result.hasHit;
    if (wheel.isInContact) {
      wheel.suspensionLength = Math.max(minLength, length);
      const inverse = -1 / result.hitNormalWorld.dot(wheel.directionWorld);
      this.chassisBody.getVelocityAtWorldPoint(result.hitPointWorld, this.velocity);
      wheel.suspensionRelativeVelocity = result.hitNormalWorld.dot(this.velocity) * inverse;
      wheel.clippedInvContactDotSuspension = inverse;
      return result.distance;
    }
    wheel.suspensionLength = wheel.suspensionRestLength;
    wheel.suspensionRelativeVelocity = 0;
    wheel.directionWorld.negate(result.hitNormalWorld);
    wheel.clippedInvContactDotSuspension = 1;
    return -1;
  }
}
