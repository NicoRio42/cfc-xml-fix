import { readFileSync, writeFileSync } from "fs";
import { DOMParser } from "linkedom";

const xml = readFileSync("splits-cfmd.xml").toString();
const document = new DOMParser().parseFromString(xml, "text/xml");

document.querySelectorAll("PersonResult").forEach((e) => e.remove());
document.querySelectorAll("Course").forEach((e) => e.remove());

writeFileSync("out/classes.xml", document.toString());

const templateDoc = new DOMParser().parseFromString(xml, "text/xml");
templateDoc.querySelectorAll("ClassResult").forEach((e) => e.remove());

const newDoc = new DOMParser().parseFromString(xml, "text/xml");

newDoc.querySelectorAll("ClassResult").forEach((ClassResult) => {
  const doc = templateDoc.cloneNode(true);
  const ResultList = doc.querySelector("ResultList");
  ResultList.appendChild(ClassResult);
  const id = ClassResult.querySelector("Class Id").textContent;

  writeFileSync(`out/${id.trim()}.xml`, doc.toString());
});
