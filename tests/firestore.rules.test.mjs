import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";

const PROJECT_ID = "tcopy-12865";
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8")
    }
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

function note(ownerUid, overrides = {}) {
  return {
    ownerUid,
    text: "Rules test note",
    visibility: "public",
    pinned: false,
    createdAt: serverTimestamp(),
    updatedAt: null,
    tags: [],
    ...overrides
  };
}

test("signed-in user can create a public note", async () => {
  const db = env.authenticatedContext("user-a").firestore();
  await assertSucceeds(setDoc(doc(db, "clips/public-1"), note("user-a")));
});

test("guest can create public notes but cannot create private notes", async () => {
  const db = env.authenticatedContext("guest-a", {
    firebase: { sign_in_provider: "anonymous" }
  }).firestore();

  await assertSucceeds(setDoc(doc(db, "clips/guest-public"), note("guest-a")));
  await assertFails(setDoc(
    doc(db, "clips/guest-private"),
    note("guest-a", { visibility: "private" })
  ));
});

test("private notes are readable only by their owner or admin", async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "clips/private-a"), note("user-a", {
      visibility: "private"
    }));
    await setDoc(doc(context.firestore(), "clips/public-a"), note("user-a"));
  });

  const owner = env.authenticatedContext("user-a").firestore();
  const other = env.authenticatedContext("user-b").firestore();
  const admin = env.authenticatedContext("admin-a", { admin: true }).firestore();

  await assertSucceeds(getDoc(doc(owner, "clips/private-a")));
  await assertFails(getDoc(doc(other, "clips/private-a")));
  await assertSucceeds(getDoc(doc(other, "clips/public-a")));
  await assertSucceeds(getDoc(doc(admin, "clips/private-a")));
});

test("querying public notes is allowed while broad collection reads are denied", async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "clips/public-a"), note("user-a"));
    await setDoc(doc(context.firestore(), "clips/private-a"), note("user-a", {
      visibility: "private"
    }));
  });

  const db = env.authenticatedContext("user-b").firestore();
  await assertSucceeds(getDocs(query(
    collection(db, "clips"),
    where("visibility", "==", "public")
  )));
  await assertFails(getDocs(collection(db, "clips")));
});

test("owner can edit, retag, pin and delete their own note", async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "clips/owned"), note("user-a"));
  });

  const db = env.authenticatedContext("user-a").firestore();
  const ref = doc(db, "clips/owned");

  await assertSucceeds(updateDoc(ref, {
    text: "Updated note",
    updatedAt: serverTimestamp()
  }));
  await assertSucceeds(updateDoc(ref, { tags: ["work", "ideas"] }));
  await assertSucceeds(updateDoc(ref, {
    pinned: true,
    updatedAt: serverTimestamp()
  }));
  await assertSucceeds(deleteDoc(ref));
});

test("users cannot edit or delete another user's note", async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "clips/owned"), note("user-a"));
  });

  const db = env.authenticatedContext("user-b").firestore();
  const ref = doc(db, "clips/owned");

  await assertFails(updateDoc(ref, {
    text: "Unauthorized edit",
    updatedAt: serverTimestamp()
  }));
  await assertFails(deleteDoc(ref));
});

test("invalid note payloads and excessive tags are rejected", async () => {
  const db = env.authenticatedContext("user-a").firestore();

  await assertFails(setDoc(doc(db, "clips/empty"), note("user-a", {
    text: ""
  })));
  await assertFails(setDoc(doc(db, "clips/too-long"), note("user-a", {
    text: "x".repeat(20001)
  })));
  await assertFails(setDoc(doc(db, "clips/too-many-tags"), note("user-a", {
    tags: Array.from({ length: 9 }, (_, i) => "tag-" + i)
  })));
  await assertFails(setDoc(doc(db, "clips/extra-field"), {
    ...note("user-a"),
    isAdmin: true
  }));
});

test("admin can moderate notes but cannot change original ownership", async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "clips/moderated"), note("user-a"));
  });

  const db = env.authenticatedContext("admin-a", { admin: true }).firestore();
  const ref = doc(db, "clips/moderated");

  await assertSucceeds(updateDoc(ref, {
    text: "Admin moderation",
    updatedAt: serverTimestamp()
  }));
  await assertFails(updateDoc(ref, {
    ownerUid: "admin-a",
    updatedAt: serverTimestamp()
  }));
  await assertSucceeds(deleteDoc(ref));
});
