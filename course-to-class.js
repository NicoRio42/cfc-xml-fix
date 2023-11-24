import { readFileSync, writeFileSync } from "fs";
import { DOMParser } from "linkedom";

const runnersStr = readFileSync("cfmd-participants.csv");

/**
 * @typedef Runner
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} runnerClass
 */

/** @type {Record<string, Runner>} */
const runnerMap = {};

runnersStr
  .toString()
  .split("\n")
  .forEach((rawRunner, index) => {
    if (index === 0) return;

    const cells = rawRunner.split(";").map((s) => s.trim());

    runnerMap[cells[0]] = {
      firstName: cells[2],
      lastName: cells[1],
      runnerClass: cells[3],
    };
  });

const xmlStr = readFileSync("splits-cfmd.xml").toString();
const doc = new DOMParser().parseFromString(xmlStr, "text/xml");

const template = doc.cloneNode(true);

const classResultTemplate = template
  .querySelector("ClassResult")
  .cloneNode(true);

classResultTemplate
  .querySelectorAll("PersonResult")
  .forEach((PersonResult) => PersonResult.remove());

template
  .querySelectorAll("ClassResult")
  .forEach((ClassResult) => ClassResult.remove());

/** @type {Record<string, Element>} */
const classesMap = {};
let classIndex = 1;

doc.querySelectorAll("PersonResult").forEach((PersonResult) => {
  const bibNum = PersonResult.querySelector("BibNumber").textContent.trim();
  const corespondingRunner = runnerMap[bibNum];

  if (corespondingRunner === undefined) return;

  if (classesMap[corespondingRunner.runnerClass] === undefined) {
    const ClassResult = classResultTemplate.cloneNode(true);
    ClassResult.querySelector("Class Id").textContent = Number(classIndex++);
    ClassResult.querySelector("Class Name").textContent =
      corespondingRunner.runnerClass;

    classesMap[corespondingRunner.runnerClass] = ClassResult;
  }

  classesMap[corespondingRunner.runnerClass].appendChild(PersonResult);
});

const ResultList = template.querySelector("ResultList");

Object.values(classesMap).forEach((cls) => ResultList.appendChild(cls));

writeFileSync("splits-cfmd-cate.xml", template.toString());
