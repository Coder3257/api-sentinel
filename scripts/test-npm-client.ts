import { findMajorUpgrade } from "../lib/registry/npm-client";

async function run() {
  console.log("Running npm-client tests...");

  // 1. react at 17.0.2
  try {
    const res1 = await findMajorUpgrade("react", "17.0.2");
    console.log("1. react at 17.0.2 ->", res1);
  } catch (err) {
    console.error("1. react at 17.0.2 failed:", err);
  }

  // 2. stripe at 14.0.0
  try {
    const res2 = await findMajorUpgrade("stripe", "14.0.0");
    console.log("2. stripe at 14.0.0 ->", res2);
  } catch (err) {
    console.error("2. stripe at 14.0.0 failed:", err);
  }

  // 3. non-existent package
  try {
    const res3 = await findMajorUpgrade("apisentinel-non-existent-package-xyz-123", "1.0.0");
    console.log("3. non-existent package ->", res3);
  } catch (err) {
    console.error("3. non-existent package failed:", err);
  }

  // 4. unparseable version
  try {
    const res4 = await findMajorUpgrade("react", "workspace:*");
    console.log("4. unparseable version ->", res4);
  } catch (err) {
    console.error("4. unparseable version failed:", err);
  }

  // 5. "@stripe/stripe-js" at 2.0.0
  try {
    const res5 = await findMajorUpgrade("@stripe/stripe-js", "2.0.0");
    console.log("5. @stripe/stripe-js at 2.0.0 ->", res5);
  } catch (err) {
    console.error("5. @stripe/stripe-js at 2.0.0 failed:", err);
  }

  // 6. "@types/node" at 20.0.0
  try {
    const res6 = await findMajorUpgrade("@types/node", "20.0.0");
    console.log("6. @types/node at 20.0.0 ->", res6);
  } catch (err) {
    console.error("6. @types/node at 20.0.0 failed:", err);
  }
}

run();
