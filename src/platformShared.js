export const PERSISTED_STATE_KEYS = [
  "cgb_chargeLog",
  "cgb_coaData",
  "cgb_carbonCoaData",
  "cgb_settings",
  "cgb_lastChangeout",
  "cgb_stackDataExtra",
  "cgb_downtimeHrs",
  "cgb_thermalLog",
  "cgb_loggerLog",
];

export function createDefaultSettings() {
  return {
    bedMass: 6000,
    flowM3hr: 9000,
    crossSectionM2: 1.5,
    naphthaleneFrac: 0.53,
    utilisationRate: 0.82,
    typicalTempC: 12.0,
    typicalRH: 80,
    stackTempCorrectionC: 10.3,
    preTestBufferDays: 14,
    preTestBufferActiveHrs: 150,
    vocRiskWeight: 0.55,
    useConservativeRH: true,
    isSameCarbonCharge: false,
    batReviewDate: new Date().toISOString().slice(0, 10),
    batReviewedBy: "",
  };
}

export function createDefaultPlatformState() {
  return {
    cgb_stackDataExtra: [],
    cgb_coaData: [],
    cgb_carbonCoaData: [],
    cgb_chargeLog: [],
    cgb_lastChangeout: "2026-03-20",
    cgb_downtimeHrs: 0,
    cgb_thermalLog: [],
    cgb_loggerLog: [],
    cgb_settings: createDefaultSettings(),
  };
}

export function createLocalBackupPayload(state, modelVersion, modelBuildDate) {
  const payload = {
    exportedAt: new Date().toISOString(),
    modelVersion,
    modelBuildDate,
    backupSchema: "cgb-platform-v1",
  };
  PERSISTED_STATE_KEYS.forEach(key => {
    payload[key] = state[key];
  });
  return payload;
}
