#!/usr/bin/env bash

set -e

PROJECT_ROOT=/Users/ilya/cursor/mlw
cur_dir=$PWD

cd $PROJECT_ROOT

#!/usr/bin/env bash


if [ $# -ne 1 ]; then
  echo "Usage: $0 <password>"
  exit 1
fi

PASSWORD="$1"

node -e "
const bcrypt = require('bcryptjs');
bcrypt.hash(process.argv[1], 10)
  .then(hash => console.log(hash))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
" "$PASSWORD"

cd $cur_dir
