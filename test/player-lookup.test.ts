import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  FidePlayer,
  AutocompletePlayer,
} from "../src/lichess-api.js";
import * as lichessTools from "../src/tools/lichess.js";

// ─── formatFidePlayer (#39) ────────────────────────────────────────

test("formatFidePlayer renders name, id, federation, title, year and ratings", () => {
  const p: FidePlayer = {
    id: 1503014,
    name: "Carlsen, Magnus",
    federation: "NOR",
    year: 1990,
    title: "GM",
    standard: 2841,
    rapid: 2832,
    blitz: 2869,
  };
  const out = lichessTools.formatFidePlayer(p);
  assert.match(out, /Name: Carlsen, Magnus/);
  assert.match(out, /FIDE ID: 1503014/);
  assert.match(out, /Federation: NOR/);
  assert.match(out, /Title: GM/);
  assert.match(out, /Born: 1990/);
  assert.match(out, /standard 2841/);
  assert.match(out, /rapid 2832/);
  assert.match(out, /blitz 2869/);
});

test("formatFidePlayer tolerates a player with no ratings/title/year", () => {
  const p = { id: 42, name: "Nobody, A" } as FidePlayer;
  let out = "";
  assert.doesNotThrow(() => {
    out = lichessTools.formatFidePlayer(p);
  });
  assert.match(out, /Name: Nobody, A/);
  assert.match(out, /FIDE ID: 42/);
  assert.doesNotMatch(out, /Title:/);
});

// ─── formatFideSearch (#39) ────────────────────────────────────────

test("formatFideSearch lists matches with id and title", () => {
  const players: FidePlayer[] = [
    { id: 1503014, name: "Carlsen, Magnus", federation: "NOR", title: "GM", standard: 2841 },
    { id: 1, name: "Carlsen, Other" },
  ];
  const out = lichessTools.formatFideSearch(players);
  assert.match(out, /Found 2 FIDE players/);
  assert.match(out, /Carlsen, Magnus/);
  assert.match(out, /1503014/);
  assert.match(out, /Carlsen, Other/);
});

test("formatFideSearch reports an empty result", () => {
  assert.match(lichessTools.formatFideSearch([]), /No FIDE players found/);
});

test("formatFideSearch caps a long result list with a note", () => {
  const many: FidePlayer[] = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    name: `Player ${i}`,
  }));
  const out = lichessTools.formatFideSearch(many);
  assert.match(out, /Found 60 FIDE players/);
  assert.match(out, /more not shown/);
});

// ─── formatAutocomplete (#44) ──────────────────────────────────────

test("formatAutocomplete lists names and prefixes titles", () => {
  const result: AutocompletePlayer[] = [
    { id: "magnuscarlsen", name: "MagnusCarlsen", title: "GM", online: true },
    { id: "magnus5", name: "Magnus5" },
  ];
  const out = lichessTools.formatAutocomplete(result);
  assert.match(out, /Found 2 matching players/);
  assert.match(out, /GM MagnusCarlsen/);
  assert.match(out, /Magnus5/);
});

test("formatAutocomplete reports no matches", () => {
  assert.match(lichessTools.formatAutocomplete([]), /No matching players/);
});
