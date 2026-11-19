import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hotelActionSchema,
  hotelValidationMessage,
} from "../src/lib/hotels/validation";
const profile = {
  name: "Fictional Hotel",
  address: "123 Fictional Road",
  city: "Manali",
  region: "Himachal Pradesh",
  countryCode: "IN",
  postalCode: "175131",
  timezone: "Asia/Kolkata",
  contactEmail: "agency@test.invalid",
  contactPhone: "+919876543210",
  amenities: [],
  photoUrls: [],
  policies: "Check in at 14:00.",
  cancellationPolicy: "Contact hotel.",
  taxBps: 0,
};
test("registration feedback identifies the invalid phone without suggesting an occupancy or email conflict", () => {
  const result = hotelActionSchema.safeParse({
    action: "create",
    profile: { ...profile, contactPhone: "8123456789" },
  });
  assert.equal(result.success, false);
  if (!result.success) {
    const message = hotelValidationMessage(result.error);
    assert.match(message, /Hotel phone.*country code/);
    assert.doesNotMatch(message, /occupancy|email|8123456789/);
  }
});
test("multiple invalid registration fields get safe named guidance without echoing input", () => {
  const result = hotelActionSchema.safeParse({
    action: "create",
    profile: {
      ...profile,
      contactEmail: "private-invalid-email",
      countryCode: "in",
      timezone: "private-invalid-zone",
    },
  });
  assert.equal(result.success, false);
  if (!result.success) {
    const message = hotelValidationMessage(result.error);
    assert.match(message, /Country code/);
    assert.match(message, /Hotel timezone/);
    assert.match(message, /Hotel contact email/);
    assert.doesNotMatch(message, /private-invalid/);
  }
});
test("valid hotel contact email is accepted and room occupancy limits remain enforced", () => {
  assert.equal(
    hotelActionSchema.safeParse({ action: "create", profile }).success,
    true,
  );
  const result = hotelActionSchema.safeParse({
    action: "room",
    hotelId: "hotel",
    revision: 0,
    room: {
      name: "Deluxe",
      description: "",
      totalRooms: 2,
      maxAdults: 2,
      maxChildren: 1,
      maxOccupancy: 4,
      amenities: [],
      active: true,
    },
  });
  assert.equal(result.success, false);
  if (!result.success)
    assert.match(hotelValidationMessage(result.error), /Combined occupancy/);
});
