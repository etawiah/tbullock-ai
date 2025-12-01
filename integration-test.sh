#!/bin/bash

################################################################################
# Menu Builder Phase 3 Integration Test
#
# Usage:
#   ./integration-test.sh
#   ./integration-test.sh --base-public https://example.com --base-admin https://admin.example.com --email test@example.com
#
# Environment Variables:
#   BASE_URL_PUBLIC  - Public API base URL (default: https://ai-bartender.pages.dev)
#   BASE_URL_ADMIN   - Admin API base URL (default: https://admin.ai-bartender.pages.dev)
#   ADMIN_EMAIL      - Admin email for Cloudflare Access auth (default: eugene@tawiah.net)
#
# Tests:
#   1. GET /api/menu - public menu
#   2. GET /api/menu/admin - admin view with auth
#   3. POST /api/menu/items - create item
#   4. PATCH /api/menu/items/{id} - update item
#   5. DELETE /api/menu/items/{id} - soft-delete item
#   6. POST /api/menu/rollback/{version} - rollback test
#
################################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration (override via env vars or command-line args)
BASE_URL_PUBLIC="${BASE_URL_PUBLIC:-https://ai-bartender.pages.dev}"
BASE_URL_ADMIN="${BASE_URL_ADMIN:-https://admin.ai-bartender.pages.dev}"
ADMIN_EMAIL="${ADMIN_EMAIL:-eugene@tawiah.net}"

# Parse command-line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --base-public)
      BASE_URL_PUBLIC="$2"
      shift 2
      ;;
    --base-admin)
      BASE_URL_ADMIN="$2"
      shift 2
      ;;
    --email)
      ADMIN_EMAIL="$2"
      shift 2
      ;;
    --help)
      head -n 20 "$0" | tail -n +2
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to print section headers
print_section() {
  echo -e "\n${BLUE}▶ $1${NC}"
}

# Helper function to print test step
print_step() {
  echo -e "  ${YELLOW}→${NC} $1"
}

# Helper function to print success
print_success() {
  echo -e "  ${GREEN}✓${NC} $1"
  ((TESTS_PASSED++))
}

# Helper function to print error
print_error() {
  echo -e "  ${RED}✗${NC} $1"
  ((TESTS_FAILED++))
}

# Helper function for HTTP request
http_request() {
  local method=$1
  local url=$2
  local auth=$3
  local data=$4
  local description=$5

  ((TESTS_RUN++))
  print_step "$description"

  local headers="-H 'Content-Type: application/json'"
  if [[ ! -z "$auth" ]]; then
    headers="$headers -H 'Cf-Access-Authenticated-User-Email: $auth'"
  fi

  local cmd="curl -s -X $method '$url' $headers"
  if [[ ! -z "$data" ]]; then
    cmd="$cmd -d '$data'"
  fi

  local response=$(eval "$cmd")
  local http_code=$(curl -s -o /dev/null -w "%{http_code}" -X $method "$url" $headers)

  echo -e "    Status: $http_code"

  if [[ "$http_code" =~ ^[2][0-9]{2}$ ]]; then
    print_success "$description (HTTP $http_code)"
    echo -e "    Response: $(echo "$response" | jq -c '.' 2>/dev/null || echo "$response")"
    echo "$response" # Return response for parsing
    return 0
  else
    print_error "$description (HTTP $http_code)"
    echo -e "    Response: $(echo "$response" | jq '.' 2>/dev/null || echo "$response")"
    return 1
  fi
}

################################################################################
# TESTS
################################################################################

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Menu Builder Phase 3 - Integration Test Suite${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "Public URL: $BASE_URL_PUBLIC"
echo -e "Admin URL:  $BASE_URL_ADMIN"
echo -e "Admin Email: $ADMIN_EMAIL"

print_section "TEST 1: GET /api/menu (Public - No Auth)"
response1=$(http_request "GET" "$BASE_URL_PUBLIC/api/menu" "" "" "Fetch public menu")

print_section "TEST 2: GET /api/menu/admin (Admin - With Auth)"
response2=$(http_request "GET" "$BASE_URL_ADMIN/api/menu/admin" "$ADMIN_EMAIL" "" "Fetch admin menu with authentication")

# Extract current menu version for rollback test later
if echo "$response2" | jq -e '.data.version' >/dev/null 2>&1; then
  current_version=$(echo "$response2" | jq '.data.version')
  print_success "Extracted current menu version: $current_version"
else
  print_error "Could not extract menu version from response"
  current_version=0
fi

print_section "TEST 3: POST /api/menu/items (Create Item)"

# Create test item with unique ID
timestamp=$(date +%s)
test_item_id="test-drink-$timestamp"

create_payload=$(cat <<EOF
{
  "id": "$test_item_id",
  "favoriteId": "test-favorite-id",
  "name": "Test Drink $timestamp",
  "description": "A test drink created by integration test",
  "primarySpirit": "vodka",
  "tags": ["test"],
  "status": "active"
}
EOF
)

response3=$(http_request "POST" "$BASE_URL_ADMIN/api/menu/items" "$ADMIN_EMAIL" "$create_payload" "Create new menu item")

# Extract item version for update test
if echo "$response3" | jq -e '.data.version' >/dev/null 2>&1; then
  item_version=$(echo "$response3" | jq '.data.version')
  print_success "Created item version: $item_version"
else
  print_error "Could not extract item version from create response"
  item_version=1
fi

print_section "TEST 4: PATCH /api/menu/items/{id} (Update Item)"

update_payload=$(cat <<EOF
{
  "name": "Updated Test Drink",
  "description": "This drink was updated by integration test",
  "tags": ["test", "updated"],
  "version": $item_version
}
EOF
)

response4=$(http_request "PATCH" "$BASE_URL_ADMIN/api/menu/items/$test_item_id" "$ADMIN_EMAIL" "$update_payload" "Update menu item")

# Extract new version
if echo "$response4" | jq -e '.data.version' >/dev/null 2>&1; then
  new_item_version=$(echo "$response4" | jq '.data.version')
  print_success "Updated item to version: $new_item_version"
else
  print_error "Could not extract new item version"
  new_item_version=$item_version
fi

print_section "TEST 5: DELETE /api/menu/items/{id} (Soft-Delete Item)"

delete_payload=$(cat <<EOF
{
  "version": $new_item_version
}
EOF
)

response5=$(http_request "DELETE" "$BASE_URL_ADMIN/api/menu/items/$test_item_id" "$ADMIN_EMAIL" "$delete_payload" "Retire (soft-delete) menu item")

print_section "TEST 6: POST /api/menu/rollback/{version} (Rollback Test)"

if [[ $current_version -gt 0 ]]; then
  rollback_payload="{}"

  # Try to rollback to a version that exists
  rollback_version=$((current_version))
  if [[ $rollback_version -gt 0 ]]; then
    response6=$(http_request "POST" "$BASE_URL_ADMIN/api/menu/rollback/$rollback_version" "$ADMIN_EMAIL" "$rollback_payload" "Rollback menu to version $rollback_version" || true)
  else
    print_step "Skipping rollback test (no previous version)"
  fi
else
  print_step "Skipping rollback test (no version info)"
fi

################################################################################
# SUMMARY
################################################################################

print_section "TEST SUMMARY"
echo -e "  Tests run:    $TESTS_RUN"
echo -e "  ${GREEN}Passed:${NC}      $TESTS_PASSED"
echo -e "  ${RED}Failed:${NC}      $TESTS_FAILED"

if [[ $TESTS_FAILED -eq 0 ]]; then
  echo -e "\n${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo -e "\n${RED}✗ Some tests failed${NC}"
  exit 1
fi
