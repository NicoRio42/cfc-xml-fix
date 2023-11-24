import { readFileSync, writeFileSync } from "fs";
import { parseCourseLength, stringToSeconds } from "./utils.js";
import { DOMParser } from "linkedom";

const FIRST_START = "2023-05-18T16:00:00+02:00";
const FIRST_START_MILLISECONDS = new Date(FIRST_START).getTime();

/**
 * @typedef Runner
 * @property {string} firstName
 * @property {string} lastName
 * @property {string | number} startTime
 * @property {string | number} finishTime
 * @property {string} time
 * @property {string} classId
 * @property {string} className
 * @property {string} bibNumber
 * @property {string} courseId
 * @property {string} courseName
 * @property {string} courseLength
 * @property {string} courseClimb
 * @property {"OK" | "MissingPunch" | "DidNotStart" | "DidNotFinish"} status
 * @property {SplitTime[]} splitTimes
 */

/**
 * @typedef SplitTime
 * @property {string} controlCode
 * @property {"ok" | "missing"} status
 * @property {string} [time]
 */

/**
 * @typedef IOFClass
 * @property {string} name
 * @property {string} courseLength
 * @property {string} courseClimb
 * @property {Runner[]} runners
 */

/**
 * @param {string} csvString
 */
function dirtyCsvToIofXml(csvString) {
  const rawLines = csvString.split("\n").filter((line) => line.trim() !== "");
  rawLines.shift();

  /** @type {Runner[]} */
  const runners = rawLines.map((rawLine, index) => {
    const cells = rawLine
      .split(";")
      .map((cell) => cell.trim().replaceAll('"', ""));
    const lastName = cells[7];
    const firstName = cells[8];

    const bibNumber = cells[2];

    const classId = cells[27];
    const className = cells[28];

    const relativeStartTime = stringToSeconds(cells[14]);
    const relativeFinishTime = stringToSeconds(cells[15]);

    /** @type  {"OK" | "MissingPunch" | "DidNotStart" | "DidNotFinish"} */
    let status = "OK";

    const startTime = isNaN(relativeStartTime)
      ? -1
      : new Date(
          FIRST_START_MILLISECONDS + relativeStartTime * 1000
        ).toISOString();

    const finishTime = isNaN(relativeFinishTime)
      ? -1
      : new Date(
          FIRST_START_MILLISECONDS + relativeFinishTime * 1000
        ).toISOString();

    if (finishTime === -1) status = "DidNotFinish";
    if (startTime === -1) status = "DidNotStart";

    const time = stringToSeconds(cells[15]).toString();

    let offset = cells[56] === "" ? 1 : 0;

    const courseId = cells[56 + offset];
    const courseName = cells[57 + offset];
    const courseLength = parseCourseLength(cells[58 + offset]);
    const courseClimb = cells[59 + offset];

    const controlsArray = cells.slice(64 + offset);
    const controlsArrayLength = controlsArray.length;

    /** @type {SplitTime[]} */
    const splitTimes = [];

    for (let i = 0; i < controlsArrayLength - 1; i += 2) {
      const controlCode = controlsArray[i];
      const controlTime = controlsArray[i + 1];

      const controlStatus = controlTime.startsWith("-") ? "missing" : "ok";

      if (controlStatus === "missing") status = "MissingPunch";

      splitTimes.push(
        controlStatus === "ok"
          ? {
              controlCode,
              status: controlStatus,
              time: stringToSeconds(controlTime).toString(),
            }
          : { controlCode, status: controlStatus }
      );
    }

    return {
      firstName,
      lastName,
      startTime,
      finishTime,
      time,
      classId,
      className,
      bibNumber,
      courseId,
      courseName,
      courseLength,
      courseClimb,
      status,
      splitTimes,
    };
  });

  /** @type {Record<string, IOFClass>} */
  const classes = {};

  runners.forEach((runner) => {
    if (classes[runner.classId] === undefined)
      classes[runner.classId] = {
        name: runner.className,
        courseLength: runner.courseLength,
        courseClimb: runner.courseClimb,
        runners: [],
      };
    const iofClass = classes[runner.classId];
    iofClass.runners.push(runner);
  });

  const xmlTemplate = readFileSync("template-indiv.xml").toString();
  const document = new DOMParser().parseFromString(xmlTemplate, "text/xml");

  const EventName = document.querySelector("Event Name");
  EventName.textContent = "Sprint open";

  const EventStartDate = document.querySelector("Event StartTime Date");
  EventStartDate.textContent = "2023-05-18";

  const EventStartTime = document.querySelector("Event StartTime Time");
  EventStartTime.textContent = "16:00:00+02:00";

  const ResultList = document.querySelector("ResultList");

  Object.entries(classes).forEach(
    ([id, { name, courseClimb, courseLength, runners }]) => {
      const ClassResult = document.createElement("ClassResult");
      const Class = document.createElement("Class");

      const ClassId = document.createElement("Id");
      ClassId.textContent = id;
      Class.appendChild(ClassId);

      const ClassName = document.createElement("Name");
      ClassName.textContent = name;
      Class.appendChild(ClassName);

      ClassResult.appendChild(Class);

      const Course = document.createElement("Course");
      const Length = document.createElement("Length");
      Length.textContent = courseLength;
      Course.appendChild(Length);

      const Climb = document.createElement("Climb");
      Climb.textContent = courseClimb;
      Course.appendChild(Climb);

      ClassResult.appendChild(Course);

      runners.forEach((runner) => {
        const PersonResult = document.createElement("PersonResult");

        // Person
        const Person = document.createElement("Person");
        const PersonId = document.createElement("Id");
        PersonId.textContent = runner.bibNumber;
        Person.appendChild(PersonId);

        const PersonName = document.createElement("Name");

        const Family = document.createElement("Family");
        Family.textContent = runner.lastName;
        PersonName.appendChild(Family);

        const Given = document.createElement("Given");
        Given.textContent = runner.firstName;
        PersonName.appendChild(Given);

        Person.appendChild(PersonName);
        PersonResult.appendChild(Person);

        // Skipping organisation for now

        const Result = document.createElement("Result");

        const BibNumber = document.createElement("BibNumber");
        BibNumber.textContent = runner.bibNumber;
        Result.appendChild(BibNumber);

        if (runner.startTime !== -1) {
          const StartTime = document.createElement("StartTime");
          StartTime.textContent = runner.startTime;
          Result.appendChild(StartTime);

          if (runner.finishTime !== -1) {
            const FinishTime = document.createElement("FinishTime");
            FinishTime.textContent = runner.finishTime;
            Result.appendChild(FinishTime);
          }

          if (runner.time !== "NaN") {
            const Time = document.createElement("Time");
            Time.textContent = runner.time;
            Result.appendChild(Time);
          }
        }

        const Status = document.createElement("Status");
        Status.textContent = runner.status;
        Result.appendChild(Status);

        // RunnerCourse
        const RunnerCourse = document.createElement("Course");

        const RunnerCourseId = document.createElement("Id");
        RunnerCourseId.textContent = runner.courseId;
        RunnerCourse.appendChild(RunnerCourseId);

        const RunnerCourseName = document.createElement("Name");
        RunnerCourseName.textContent = runner.courseName;
        RunnerCourse.appendChild(RunnerCourseName);

        const RunnerCourseLength = document.createElement("Length");
        RunnerCourseLength.textContent = runner.courseLength;
        RunnerCourse.appendChild(RunnerCourseLength);

        const RunnerCourseClimb = document.createElement("Climb");
        RunnerCourseClimb.textContent = runner.courseClimb;
        RunnerCourse.appendChild(RunnerCourseClimb);

        Result.appendChild(RunnerCourse);

        // SplitTimes
        runner.splitTimes.forEach((splitTime) => {
          const SplitTime = document.createElement("SplitTime");

          const ControlCode = document.createElement("ControlCode");
          ControlCode.textContent = splitTime.controlCode;
          SplitTime.appendChild(ControlCode);

          if (splitTime.status === "missing") {
            SplitTime.setAttribute("status", "Missing");
          } else {
            const ControlTime = document.createElement("Time");
            ControlTime.textContent = splitTime.time;
            SplitTime.appendChild(ControlTime);
          }

          Result.appendChild(SplitTime);
        });

        PersonResult.appendChild(Result);

        ClassResult.appendChild(PersonResult);
      });

      ResultList.appendChild(ClassResult);
    }
  );

  return document.toString();
}

const csv = readFileSync("circuits-SplitTimes.csv", {
  encoding: "latin1",
}).toString();

const document = dirtyCsvToIofXml(csv);

writeFileSync("out-indiv.xml", document);
