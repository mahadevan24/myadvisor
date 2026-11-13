import { test } from "node:test";
import assert from "node:assert/strict";
import { searchField } from "../src/components/search-field";

test("searchField primitive initializes with empty state and provides set API", () => {
  const instance = searchField({ id: "search-1" });
  assert.equal(instance.get().value, "");

  instance.api.set("machine learning");
  assert.equal(instance.get().value, "machine learning");

  instance.api.set("");
  assert.equal(instance.get().value, "");
});

test("searchField slots are defined with input and clear parts", () => {
  const instance = searchField({ id: "search-2" });
  const inputPart = instance.part("input");
  const clearPart = instance.part("clear");

  assert.equal(inputPart.slot, "input");
  assert.equal(clearPart.slot, "clear");

  instance.api.set("quantum computing");
  assert.equal(instance.get().value, "quantum computing");

  instance.api.set("");
  assert.equal(instance.get().value, "");
});
