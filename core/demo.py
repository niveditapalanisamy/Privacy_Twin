"""Synthetic source fixtures, processed through ordinary registration and scanning."""
import csv
import io
import sqlite3
from contextlib import closing


def csv_bytes(headers, rows):
    stream = io.StringIO()
    writer = csv.writer(stream)
    writer.writerow(headers)
    writer.writerows(rows)
    return stream.getvalue().encode()


def customers(version="v1"):
    headers = ["customer_name", "loyalty_id", "contact_value", "pin_code", "dob", "company_pan", "ref_no"]
    rows = []
    for i in range(50):
        loyalty = f"LOY-{100001+i}" if version != "v2" or i >= 40 else f"910000{i:04d}"
        rows.append([f"Example Customer {i+1}", loyalty, f"person{i}@example.test" if i < 32 else f"920000{i:04d}", f"600{i+1:03d}", f"19{70+i%25:02d}-03-14", "ABCPD1234E", "234567890124" if i % 5 else "234567890123"])
    if version == "renamed":
        headers[1] = "member_reference"
    return csv_bytes(headers, rows)


def fixtures():
    accounts = csv_bytes(["account_id", "branch_ifsc", "gstin", "owner_email"], [[f"ACC-{2000+i}", "SBIN0001234", "27AAPFU0939F1ZV", f"account{i}@example.test"] for i in range(30)])
    employees = csv_bytes(["employee_id", "employee_name", "email", "age", "address"], [[f"EMP-{3000+i}", f"Example Employee {i+1}", f"employee{i}@example.test", str(22+i), f"Example street {i}"] for i in range(20)])
    with closing(sqlite3.connect(":memory:")) as c:
        c.execute("CREATE TABLE contacts(person_id TEXT, email TEXT, phone TEXT)")
        c.executemany("INSERT INTO contacts VALUES(?,?,?)", [(f"USR-{5000+i}", f"contact{i}@example.test", f"930000{i:04d}") for i in range(15)])
        c.execute("CREATE TABLE offices(office_id TEXT, city TEXT, pin_code TEXT)")
        c.executemany("INSERT INTO offices VALUES(?,?,?)", [(f"OFF-{4000+i}", "Example City", "600001") for i in range(5)])
        c.commit()
        database = c.serialize()
    return [("customers", "customers.csv", "CSV", customers()), ("accounts", "accounts.csv", "CSV", accounts),
            ("employees", "employees.csv", "CSV", employees), ("directory", "directory.db", "SQLite", database)]
