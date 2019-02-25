const fs = require('fs');

let fileLines = null;
const collections = [];

function reportError(errorText) {
  console.log(`ERROR: ${errorText}`);
  process.exit(1);
}

function getNextLine() {
  return fileLines.shift().trim();
}

function hasMoreLines() {
  return fileLines.length > 0;
}

function readFile(fileName) {
  const fileAsString = fs.readFileSync(fileName, 'utf8');
  fileLines = fileAsString.split('\n');
}

function startsWith(str, textToFind) {
  return str.trim().indexOf(textToFind.trim()) === 0;
}

function convertData(data, type) {
  if (
    startsWith(type, 'varchar') ||
    startsWith(type, 'blob') ||
    startsWith(type, 'text') ||
    startsWith(type, 'date') ||
    startsWith(type, 'char')
  ) {
    return data;
  }

  if (
    startsWith(type, 'int') ||
    startsWith(type, 'float') ||
    startsWith(type, 'decimal')
  ) {
    return Number(data);
  }

  if (startsWith(type, 'tinyint')) {
    return Number(data) === 1;
  }

  throw new TypeError(`Don't know this type: ${type}`);
}

function readNextTableDef(startLine) {
  let currentLine = startLine;

  if (!startsWith(currentLine, 'CREATE TABLE')) {
    return false;
  }

  const tableName = currentLine.split('`')[1];
  console.log(`Converting table: ${tableName}`);
  currentLine = getNextLine();
  const fields = [];

  while (startsWith(currentLine, '`')) {
    const parts = currentLine.split('`');
    const fieldName = parts[1];
    const fieldType = parts[2].split(' ')[1];

    fields.push({
      name: fieldName,
      type: fieldType,
    });

    currentLine = getNextLine();
  }

  collections.push({
    name: tableName,
    fields,
  });

  return true;
}

function readTableValues(startLine) {
  let currentLine = startLine;

  if (!startsWith(currentLine, 'INSERT INTO')) {
    return false;
  }

  const currentCollection = collections[collections.length - 1];
  const tableName = currentCollection.name;
  const { fields } = currentCollection;

  currentLine = currentLine.replace(`INSERT INTO \`${tableName}\` VALUES `, '');
  let index = 1;
  let valueId = 0;
  let insideString = false;
  let currentValue = '';
  const values = [];
  let pair = {};

  while (index < currentLine.length) {
    const previousChar = currentLine.charAt(index - 1);
    const currentChar = currentLine.charAt(index);

    if ((currentChar === ',' || currentChar === ')') && !insideString) {
      const field = fields[valueId];
      if (!field) {
        console.log(fields, values, currentValue);
        throw new ReferenceError(`Unknown value id: ${valueId}`);
      }

      pair[field.name] = convertData(currentValue, field.type);

      valueId += 1;
      currentValue = '';

      if (currentChar === ')') {
        index += 2;
        values.push(pair);
        pair = {};
        valueId = 0;
      }
    } else if (currentChar === "'" && previousChar !== '\\') {
      insideString = !insideString;
    } else {
      currentValue += currentChar;
    }

    index += 1;
  }

  collections[collections.length - 1].values = values;
  return true;
}

if (process.argv.length !== 3) {
  reportError('Please specify exactly one mysqldump input file');
}

const fileName = process.argv[2];
readFile(fileName);

while (hasMoreLines()) {
  const startLine = getNextLine();

  if (!readNextTableDef(startLine)) {
    readTableValues(startLine);
  }
}

for (let i = 0; i < collections.length; i += 1) {
  fs.writeFileSync(
    `${collections[i].name}.json`,
    JSON.stringify(collections[i].values),
  );
}

process.exit();
