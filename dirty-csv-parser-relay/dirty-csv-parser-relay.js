import { readFileSync, writeFileSync } from "fs";
import { parseCourseLength, stringToSeconds } from "../utils.js";
import { DOMParser } from "linkedom";

const CSV_INPUT_FILE_PATH = "splits-cfc.csv";
const IOF_XML_OUTPUT_FILE_PATH = "out-relay.xml";

const FIRST_START = "2023-05-21T06:30:00+02:00";
const FIRST_START_MILLISECONDS = new Date(FIRST_START).getTime();

const COLUMNS_INDEXES = {
  bibNumber: 1,
  legNumber: 4,
  lastName: 6,
  firstName: 7,
  startTime: 10,
  finishTime: 11,
  time: 12,
  teamName: 19,
  classId: 20,
  className: 21,
  courseId: 22,
  courseName: 23,
  courseLength: 24,
  courseControlNumber: 25,
  firstControl: 30,
};

const LAST_CONTROL_CODE = "255";

/**
 * @typedef IOFClass
 * @property {string} name
 * @property {TeamResult[]} teamResults
 */

/**
 * @typedef TeamResult
 * @property {string} name
 * @property {string} classId
 * @property {string} className
 * @property {Runner[]} runners
 */

/** @typedef  {"OK" | "MissingPunch" | "DidNotStart" | "DidNotFinish"} RunnerStatus */

/**
 * @typedef Runner
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} teamName
 * @property {string} legNumber
 * @property {string | null} startTime
 * @property {string | null} finishTime
 * @property {string | null} time
 * @property {string} classId
 * @property {string} className
 * @property {string} bibNumber
 * @property {string} courseId
 * @property {string} courseName
 * @property {string} courseLength
 * @property {RunnerStatus} status
 * @property {SplitTime[]} splitTimes
 */

/**
 * @typedef SplitTime
 * @property {string} controlCode
 * @property {"ok" | "missing"} status
 * @property {string} [time]
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

    const lastName = cells[COLUMNS_INDEXES.lastName];
    const firstName = cells[COLUMNS_INDEXES.firstName];

    const bibNumber = cells[COLUMNS_INDEXES.bibNumber];

    const legNumber = cells[COLUMNS_INDEXES.legNumber];

    const classId = cells[COLUMNS_INDEXES.classId];
    const className = cells[COLUMNS_INDEXES.className];
    const teamName = `${cells[COLUMNS_INDEXES.teamName]} ${classId}`;

    const relativeStartTime = stringToSeconds(cells[COLUMNS_INDEXES.startTime]);
    const relativeFinishTime = stringToSeconds(
      cells[COLUMNS_INDEXES.finishTime]
    );

    /** @type  {RunnerStatus} */
    let status = "OK";

    const startTime = isNaN(relativeStartTime)
      ? null
      : new Date(
          FIRST_START_MILLISECONDS + relativeStartTime * 1000
        ).toISOString();

    const finishTime = isNaN(relativeFinishTime)
      ? null
      : new Date(
          FIRST_START_MILLISECONDS + relativeFinishTime * 1000
        ).toISOString();

    if (finishTime === null) status = "DidNotFinish";
    if (startTime === null) status = "DidNotStart";

    const time = stringToSeconds(cells[COLUMNS_INDEXES.time]).toString();

    const courseId = cells[COLUMNS_INDEXES.courseId];
    const courseName = cells[COLUMNS_INDEXES.courseName];
    const courseLength = parseCourseLength(cells[COLUMNS_INDEXES.courseLength]);

    const controlsArray = cells.slice(COLUMNS_INDEXES.firstControl + 1);
    const controlsArrayLength = controlsArray.length;

    /** @type {SplitTime[]} */
    const splitTimes = [];

    for (let i = 0; i < controlsArrayLength - 1; i += 2) {
      const controlCode = controlsArray[i];
      if (controlCode === LAST_CONTROL_CODE) break;
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
      status,
      splitTimes,
      teamName,
      legNumber,
    };
  });

  /** @type {Record<string, TeamResult>} */
  const teamResultsMap = {};

  runners.forEach((runner) => {
    if (teamResultsMap[runner.teamName] === undefined)
      teamResultsMap[runner.teamName] = {
        name: runner.teamName,
        classId: runner.classId,
        className: runner.className,
        runners: [],
      };

    const teamResult = teamResultsMap[runner.teamName];

    if (
      runner.className !== teamResult.className ||
      runner.classId !== teamResult.classId
    )
      throw new Error(
        `Runner ${runner.firstName} ${runner.lastName} has different class than other runner from his team (${teamResult.name})`
      );

    teamResult.runners.push(runner);
  });

  /** @type {Record<string, IOFClass>} */
  const classes = {};

  Object.values(teamResultsMap).forEach((teamResult) => {
    if (classes[teamResult.classId] === undefined)
      classes[teamResult.classId] = {
        name: teamResult.className,
        teamResults: [],
      };

    const iofClass = classes[teamResult.classId];
    iofClass.teamResults.push(teamResult);
  });

  const xmlTemplate = readFileSync("template-relay.xml").toString();
  const document = new DOMParser().parseFromString(xmlTemplate, "text/xml");

  const EventName = document.querySelector("Event Name");
  EventName.textContent = "Sprint open";

  const [eventStartDate, eventStartTime] = FIRST_START.split("T");
  const EventStartDate = document.querySelector("Event StartTime Date");
  EventStartDate.textContent = eventStartDate;

  const EventStartTime = document.querySelector("Event StartTime Time");
  EventStartTime.textContent = eventStartTime;

  const ResultList = document.querySelector("ResultList");

  Object.entries(classes).forEach(([id, { name, teamResults }]) => {
    const ClassResult = document.createElement("ClassResult");
    const Class = document.createElement("Class");

    const ClassId = document.createElement("Id");
    ClassId.textContent = id;
    Class.appendChild(ClassId);

    const ClassName = document.createElement("Name");
    ClassName.textContent = name;
    Class.appendChild(ClassName);

    ClassResult.appendChild(Class);

    // TeamResults

    teamResults.forEach((teamResult, index) => {
      const TeamResult = document.createElement("TeamResult");
      ClassResult.appendChild(TeamResult);

      const TeamResultName = document.createElement("Name");
      TeamResultName.textContent = teamResult.name;
      TeamResult.appendChild(TeamResultName);

      const TeamResultBibNumber = document.createElement("BibNumber");
      TeamResultBibNumber.textContent = index + 1;
      TeamResult.appendChild(TeamResultBibNumber);

      teamResult.runners
        .sort((r1, r2) => +r1.legNumber - +r2.legNumber)
        .forEach((runner) => {
          const TeamMemberResult = document.createElement("TeamMemberResult");

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
          TeamMemberResult.appendChild(Person);

          // Skipping organisation for now

          const Result = document.createElement("Result");

          const BibNumber = document.createElement("BibNumber");
          BibNumber.textContent = runner.bibNumber;
          Result.appendChild(BibNumber);

          if (runner.startTime !== null) {
            const StartTime = document.createElement("StartTime");
            StartTime.textContent = runner.startTime;
            Result.appendChild(StartTime);

            if (runner.finishTime !== null) {
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

          TeamMemberResult.appendChild(Result);

          ClassResult.appendChild(TeamMemberResult);
        });
    });

    ResultList.appendChild(ClassResult);
  });

  return document.toString();
}

const csv = readFileSync(CSV_INPUT_FILE_PATH, {
  encoding: "latin1",
}).toString();

const document = dirtyCsvToIofXml(csv);

writeFileSync(IOF_XML_OUTPUT_FILE_PATH, document);
