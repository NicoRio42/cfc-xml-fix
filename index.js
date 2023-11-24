import { readFileSync, writeFileSync } from "fs";
import { DOMParser } from "linkedom";
import { stringToSeconds } from "./utils";

const csv = readFileSync("SplitTimes_.csv", { encoding: "latin1" }).toString();
const xml = readFileSync("circuits_xml.xml").toString();

let csvLines = {};

csv
  .split(
    `
`
  )
  .forEach((l, i) => {
    if (i === 0) return;
    const lineArray = l.split(";");
    const firstName = lineArray[7];
    const lastName = lineArray[6];
    if (firstName === undefined) return;
    const key =
      firstName.trim().replaceAll('"', "") +
      " " +
      lastName.trim().replaceAll('"', "");
    const line = lineArray.slice(31);
    line.pop();

    const controls = [];

    line.forEach((c, ci) => {
      if (ci % 2 === 1) return;

      const code = parseInt(c);
      const timeStr = line[ci + 1].trim();
      const time = timeStr.startsWith("-") ? -1 : stringToSeconds(timeStr);
      controls.push({ code, time });
    });

    csvLines[key] = controls.slice(0, 23);
  });

const document = new DOMParser().parseFromString(xml, "text/xml");

const TeamMemberResults = document.querySelectorAll("TeamMemberResult");

TeamMemberResults.forEach((TeamMemberResult) => {
  const Family = TeamMemberResult.querySelector("Person Name Family");
  const Given = TeamMemberResult.querySelector("Person Name Given");
  //   console.log(Family.textContent.trim() + " " + Given.textContent.trim());
  const csvLine =
    csvLines[Given.textContent.trim() + " " + Family.textContent.trim()];

  const result = TeamMemberResult.querySelector("Result");

  const ControlCard = result.querySelector("ControlCard");
  ControlCard.remove();

  csvLine.forEach((control) => {
    const SplitTime = document.createElement("SplitTime");
    const ControlCode = document.createElement("ControlCode");
    ControlCode.textContent = control.code;

    SplitTime.appendChild(ControlCode);

    if (control.time === -1) {
      SplitTime.setAttribute("status", "Missing");
    } else {
      const Time = document.createElement("Time");
      Time.textContent = control.time;
      SplitTime.appendChild(Time);
    }

    result.appendChild(SplitTime);
  });
});

writeFileSync("out.xml", document.toString());
