#!/usr/bin/env python3
"""Generate math_questions_upload.csv with 100 rows (compatible with bulk CSV import)."""

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "math_questions_upload.csv"

HEADER = [
    "question_text",
    "question_type",
    "option_a",
    "option_b",
    "option_c",
    "option_d",
    "correct_answer",
    "difficulty",
    "subject",
    "topic",
    "tags",
    "explanation",
]

# (text, opts, correct_key_letter a-d, difficulty, topic, tags, explanation)
MCQ = [
    ("What is 9 + 15?", ["22", "23", "24", "25"], "c", "EASY", "Arithmetic", "addition", "9 + 15 = 24."),
    ("What is 81 ÷ 9?", ["7", "8", "9", "10"], "c", "EASY", "Arithmetic", "division", "81 ÷ 9 = 9."),
    ("What is 12 × 11?", ["120", "121", "132", "144"], "c", "EASY", "Arithmetic", "multiplication", "12 × 11 = 132."),
    ("What is 100 − 37?", ["61", "62", "63", "64"], "c", "EASY", "Arithmetic", "subtraction", "100 − 37 = 63."),
    ("What is 2⁵?", ["16", "24", "32", "64"], "c", "EASY", "Arithmetic", "exponents", "2⁵ = 32."),
    ("What is 15% of 80?", ["10", "12", "15", "18"], "b", "EASY", "Arithmetic", "percent", "0.15 × 80 = 12."),
    ("Round 4.567 to one decimal place.", ["4.5", "4.6", "4.7", "5.0"], "b", "EASY", "Arithmetic", "rounding", "4.567 → 4.6."),
    ("What is the LCM of 4 and 6?", ["12", "18", "24", "36"], "a", "EASY", "Number theory", "lcm", "LCM(4,6) = 12."),
    ("What is the GCD of 18 and 24?", ["2", "3", "6", "8"], "c", "EASY", "Number theory", "gcd", "GCD(18,24) = 6."),
    ("Which is smallest?", ["0.25", "0.3", "0.099", "0.2"], "c", "EASY", "Arithmetic", "decimals", "0.099 < 0.2 < 0.25 < 0.3."),
    ("Convert 3/4 to a decimal.", ["0.25", "0.5", "0.75", "0.8"], "c", "EASY", "Arithmetic", "fractions", "3/4 = 0.75."),
    ("What is |−7|?", ["−7", "0", "7", "14"], "c", "EASY", "Arithmetic", "absolute", "|−7| = 7."),
    ("Simplify: 2/3 + 1/6", ["3/6", "5/6", "4/9", "1/2"], "b", "MEDIUM", "Arithmetic", "fractions", "2/3 + 1/6 = 4/6 + 1/6 = 5/6."),
    ("What is 0.125 as a fraction in lowest terms?", ["1/6", "1/8", "1/10", "1/12"], "b", "MEDIUM", "Arithmetic", "fractions", "0.125 = 1/8."),
    ("If a shirt costs $40 after a 20% discount, what was the original price?", ["$45", "$48", "$50", "$52"], "c", "MEDIUM", "Arithmetic", "percent", "0.8 × original = 40 ⇒ original = 50."),
    ("How many millimeters in 2.5 cm?", ["20", "25", "250", "2500"], "c", "EASY", "Arithmetic", "units", "1 cm = 10 mm ⇒ 2.5 cm = 25 mm."),
    ("What is 7! / 5!?", ["42", "21", "14", "35"], "a", "MEDIUM", "Arithmetic", "factorial", "7!/5! = 7×6 = 42."),
    ("What is the next prime after 17?", ["18", "19", "20", "21"], "b", "EASY", "Number theory", "prime", "19 is prime."),
    ("Is 91 prime?", ["Yes", "No", "Maybe", "Undefined"], "b", "MEDIUM", "Number theory", "prime", "91 = 7 × 13."),
    ("What is 2⁻³ as a fraction?", ["1/6", "1/8", "1/9", "3"], "b", "MEDIUM", "Arithmetic", "exponents", "2⁻³ = 1/8."),
    ("Solve: x − 9 = 14", ["x = 21", "x = 23", "x = 25", "x = 5"], "b", "EASY", "Algebra", "linear", "x = 14 + 9 = 23."),
    ("Solve: 3x = 27", ["x = 6", "x = 7", "x = 9", "x = 81"], "c", "EASY", "Algebra", "linear", "x = 9."),
    ("Expand: (x + 2)(x − 3)", ["x² − x − 6", "x² + x − 6", "x² − 5x − 6", "x² + 5x − 6"], "a", "MEDIUM", "Algebra", "polynomial", "(x+2)(x−3) = x² − x − 6."),
    ("Factor: x² − 9", ["(x−3)²", "(x+3)(x−3)", "(x+9)(x−1)", "(x−9)(x+1)"], "b", "MEDIUM", "Algebra", "factoring", "Difference of squares."),
    ("What is the slope of y = 3x − 7?", ["−7", "3", "−3", "7"], "b", "EASY", "Algebra", "linear", "y = mx + b ⇒ m = 3."),
    ("Where does y = 2x + 1 cross the y-axis?", ["(0,1)", "(1,0)", "(0,2)", "(2,0)"], "a", "EASY", "Algebra", "linear", "x = 0 ⇒ y = 1."),
    ("Solve: x² = 49", ["x = 7 only", "x = ±7", "x = 0", "x = 49"], "b", "EASY", "Algebra", "quadratic", "x = ±7."),
    ("Simplify: (x³)²", ["x⁵", "x⁶", "x⁹", "2x³"], "b", "MEDIUM", "Algebra", "exponents", "(x³)² = x⁶."),
    ("What is log₂(32)?", ["4", "5", "6", "16"], "b", "MEDIUM", "Algebra", "logarithm", "2⁵ = 32."),
    ("Solve: 2ˣ = 64", ["x = 4", "x = 5", "x = 6", "x = 8"], "c", "MEDIUM", "Algebra", "exponents", "2⁶ = 64."),
    ("Sum of first 5 positive integers?", ["10", "12", "15", "20"], "c", "EASY", "Algebra", "series", "1+2+3+4+5 = 15."),
    ("If f(x) = x² + 1, what is f(3)?", ["6", "9", "10", "12"], "c", "EASY", "Algebra", "functions", "9 + 1 = 10."),
    ("Solve inequality: 2x < 10", ["x < 4", "x < 5", "x > 5", "x > 10"], "b", "EASY", "Algebra", "inequality", "x < 5."),
    ("What is the discriminant of x² − 4x + 4 = 0?", ["0", "4", "8", "16"], "a", "HARD", "Algebra", "quadratic", "b² − 4ac = 16 − 16 = 0."),
    ("Complex number: i² equals?", ["1", "−1", "i", "0"], "b", "MEDIUM", "Algebra", "complex", "By definition i² = −1."),
    ("What is (1 + i)(1 − i)?", ["0", "1", "2", "2i"], "c", "MEDIUM", "Algebra", "complex", "(1+i)(1−i) = 1 − i² = 2."),
    ("Sum of infinite geometric 1 + 1/2 + 1/4 + … ?", ["1", "2", "3/2", "4"], "b", "HARD", "Algebra", "series", "a/(1−r) = 1/(1/2) = 2."),
    ("What is the vertex of y = (x − 2)² + 3?", ["(2,3)", "(−2,3)", "(2,−3)", "(3,2)"], "a", "MEDIUM", "Algebra", "quadratic", "Vertex form (h,k) = (2,3)."),
    ("Solve system: x + y = 5, x − y = 1", ["(2,3)", "(3,2)", "(4,1)", "(1,4)"], "b", "MEDIUM", "Algebra", "systems", "Add: 2x = 6 ⇒ x = 3, y = 2."),
    ("What is the domain of f(x) = 1/x?", ["All reals", "x ≠ 0", "x > 0", "x ≥ 0"], "b", "MEDIUM", "Algebra", "functions", "Undefined at x = 0."),
    ("Simplify √(50)", ["5√2", "10√5", "25√2", "2√25"], "a", "MEDIUM", "Algebra", "radicals", "√50 = 5√2."),
    ("What is sin(90°)?", ["0", "1/2", "1", "√3/2"], "c", "EASY", "Trigonometry", "sine", "sin 90° = 1."),
    ("What is cos(60°)?", ["0", "1/2", "√2/2", "√3/2"], "b", "EASY", "Trigonometry", "cosine", "cos 60° = 1/2."),
    ("What is tan(45°)?", ["0", "1", "√2", "undefined"], "b", "EASY", "Trigonometry", "tangent", "tan 45° = 1."),
    ("In a right triangle, legs 3 and 4. Hypotenuse?", ["5", "6", "7", "12"], "a", "EASY", "Geometry", "pythagorean", "3² + 4² = 5²."),
    ("Area of triangle base 10, height 6?", ["16", "30", "60", "120"], "b", "EASY", "Geometry", "area", "A = (1/2)bh = 30."),
    ("Circumference of circle radius 4 (use C = 2πr)?", ["4π", "8π", "16π", "2π"], "b", "EASY", "Geometry", "circles", "C = 2π×4 = 8π."),
    ("Interior angle sum of a pentagon?", ["360°", "540°", "720°", "900°"], "b", "MEDIUM", "Geometry", "polygons", "(5−2)×180° = 540°."),
    ("How many diagonals in a convex hexagon?", ["6", "8", "9", "12"], "c", "HARD", "Geometry", "polygons", "n(n−3)/2 = 9."),
    ("Volume of cube with edge 3?", ["9", "18", "27", "81"], "c", "EASY", "Geometry", "volume", "V = 3³ = 27."),
    ("Surface area of cube edge 2?", ["8", "16", "24", "32"], "c", "MEDIUM", "Geometry", "surface", "6 × 2² = 24."),
    ("Parallel lines cut by transversal: corresponding angles are…", ["equal", "supplementary", "complementary", "zero"], "a", "MEDIUM", "Geometry", "angles", "Corresponding angles are equal."),
    ("What is the distance from (0,0) to (3,4)?", ["4", "5", "7", "25"], "b", "EASY", "Geometry", "distance", "√(9+16) = 5."),
    ("Equation of circle center origin radius 5?", ["x²+y²=5", "x²+y²=10", "x²+y²=25", "x+y=5"], "c", "MEDIUM", "Geometry", "circles", "x² + y² = r² = 25."),
    ("Derivative of constant 7?", ["0", "1", "7", "x"], "a", "EASY", "Calculus", "derivative", "d/dx(c) = 0."),
    ("Derivative of 5x³?", ["5x²", "15x²", "15x³", "5x⁴"], "b", "MEDIUM", "Calculus", "derivative", "15x²."),
    ("Integral of 2x dx?", ["x² + C", "2x² + C", "x + C", "2 + C"], "a", "MEDIUM", "Calculus", "integral", "∫2x dx = x² + C."),
    ("Limit as x→0 of sin(x)/x?", ["0", "1", "undefined", "∞"], "b", "HARD", "Calculus", "limits", "Classic limit = 1."),
    ("Derivative of eˣ?", ["eˣ", "xeˣ⁻¹", "ln(x)", "1"], "a", "MEDIUM", "Calculus", "derivative", "d/dx eˣ = eˣ."),
    ("Derivative of ln(x)?", ["1/x", "x", "ln(x)", "eˣ"], "a", "MEDIUM", "Calculus", "derivative", "d/dx ln x = 1/x."),
    ("Mean of {2, 4, 6, 8}?", ["4", "5", "6", "20"], "b", "EASY", "Statistics", "mean", "Sum/4 = 20/4 = 5."),
    ("Mode of {1, 2, 2, 3, 3, 3}?", ["1", "2", "3", "none"], "c", "EASY", "Statistics", "mode", "3 appears most."),
    ("Range of {5, 1, 9, 3}?", ["6", "7", "8", "10"], "c", "EASY", "Statistics", "range", "9 − 1 = 8."),
    ("Standard deviation of a single number dataset {4} is?", ["0", "1", "4", "undefined"], "a", "MEDIUM", "Statistics", "stddev", "No variation ⇒ SD = 0."),
    ("Probability of rolling a 6 on fair die?", ["1/12", "1/6", "1/3", "1/2"], "b", "EASY", "Probability", "dice", "One favorable of six."),
    ("Two fair coins: P(two heads)?", ["1/4", "1/2", "1/3", "3/4"], "a", "EASY", "Probability", "coins", "(1/2)² = 1/4."),
    ("How many ways to arrange letters ABC?", ["3", "6", "9", "27"], "b", "EASY", "Probability", "permutation", "3! = 6."),
    ("C(5,2) equals?", ["10", "20", "25", "60"], "a", "MEDIUM", "Probability", "combinatorics", "5!/(2!3!) = 10."),
    ("Expected value of fair die?", ["3", "3.5", "4", "6"], "b", "MEDIUM", "Probability", "expectation", "(1+…+6)/6 = 3.5."),
    ("If P(A)=0.3 and P(B)=0.4 independent, P(A and B)?", ["0.7", "0.12", "0.1", "0.35"], "b", "MEDIUM", "Probability", "independent", "0.3 × 0.4 = 0.12."),
    ("Vector (1,2) + (3,4) = ?", ["(4,6)", "(3,8)", "(2,6)", "(5,5)"], "a", "EASY", "Algebra", "vectors", "Component-wise add."),
    ("Dot product (2,3)·(4,5)?", ["14", "22", "23", "26"], "c", "MEDIUM", "Algebra", "vectors", "8+15 = 23."),
    ("Matrix [[1,2],[3,4]] determinant?", ["−2", "2", "10", "−10"], "a", "HARD", "Algebra", "matrices", "1×4 − 2×3 = −2."),
    ("Is √5 rational?", ["Yes", "No", "Sometimes", "Only in ℂ"], "b", "MEDIUM", "Number theory", "irrational", "√5 is irrational."),
    ("Decimal expansion of 1/3 terminates?", ["Yes", "No", "Only base 10", "Undefined"], "b", "EASY", "Arithmetic", "decimals", "Repeating 0.333…"),
    ("Scientific notation: 0.00045 = ?", ["4.5×10⁻⁴", "4.5×10⁴", "45×10⁻⁵", "0.45×10⁻³"], "a", "MEDIUM", "Arithmetic", "notation", "4.5 × 10⁻⁴."),
    ("If y varies directly with x and y=10 when x=2, find y when x=5.", ["20", "25", "30", "50"], "b", "MEDIUM", "Algebra", "variation", "y = kx ⇒ k=5 ⇒ y=25."),
    ("Arithmetic sequence: first term 3, common difference 4, 5th term?", ["18", "19", "20", "23"], "b", "MEDIUM", "Algebra", "sequences", "a₅ = 3 + 4×4 = 19."),
    ("Geometric sequence: first term 2, ratio 3, third term?", ["6", "12", "18", "54"], "c", "MEDIUM", "Algebra", "sequences", "2×3² = 18."),
    ("What is the midpoint of (0,0) and (4,6)?", ["(2,3)", "(3,2)", "(4,4)", "(1,5)"], "a", "EASY", "Geometry", "coordinates", "Average coordinates."),
    ("Slope between (1,1) and (5,9)?", ["1", "2", "3", "4"], "b", "EASY", "Algebra", "slope", "(9−1)/(5−1) = 2."),
    ("Perimeter of rectangle 5 by 7?", ["12", "24", "35", "70"], "b", "EASY", "Geometry", "perimeter", "2(5+7)=24."),
    ("Area of trapezoid bases 4,6 height 5?", ["20", "25", "30", "50"], "b", "MEDIUM", "Geometry", "area", "A = (1/2)(4+6)×5 = 25."),
    ("sin²θ + cos²θ = ?", ["0", "1", "2", "tan θ"], "b", "EASY", "Trigonometry", "identity", "Pythagorean identity."),
    ("cos(0°)?", ["0", "1", "−1", "undefined"], "b", "EASY", "Trigonometry", "cosine", "cos 0 = 1."),
]

TF = [
    ("The number 1 is prime.", "false", "EASY", "Number theory", "prime", "1 is not prime by convention."),
    ("Every square is a rectangle.", "true", "EASY", "Geometry", "shapes", "Squares satisfy rectangle definition."),
    ("The sum of two odd numbers is always even.", "true", "EASY", "Number theory", "parity", "Odd+odd = even."),
    ("√4 is irrational.", "false", "EASY", "Number theory", "roots", "√4 = 2 is rational."),
    ("Parallel lines in a plane never intersect.", "true", "EASY", "Geometry", "lines", "Definition in Euclidean plane."),
    ("0! = 1.", "true", "EASY", "Arithmetic", "factorial", "Convention 0! = 1."),
    ("The median is always equal to the mean.", "false", "EASY", "Statistics", "median", "Not generally true."),
    ("π is a rational number.", "false", "EASY", "Constants", "pi", "π is irrational."),
    ("The derivative of a constant function is zero.", "true", "EASY", "Calculus", "derivative", "d/dx(c)=0."),
    ("All equilateral triangles are similar.", "true", "MEDIUM", "Geometry", "triangles", "Same angles (60°)."),
    ("If A ⊆ B and B ⊆ A then A = B.", "true", "MEDIUM", "Probability", "sets", "Mutual inclusion implies equality."),
    ("The product of two negative numbers is negative.", "false", "EASY", "Arithmetic", "signs", "Product of two negatives is positive."),
    ("There are infinitely many primes.", "true", "MEDIUM", "Number theory", "prime", "Euclid's theorem."),
    ("The angles of a spherical triangle always sum to 180°.", "false", "HARD", "Geometry", "spherical", "Spherical excess > 180°."),
    ("e^(iπ) + 1 = 0.", "true", "HARD", "Algebra", "complex", "Euler's identity."),
]

KEY_MAP = {"a": "option_a", "b": "option_b", "c": "option_c", "d": "option_d"}


def main() -> None:
    assert len(MCQ) + len(TF) == 100, f"expected 100 questions, got {len(MCQ)+len(TF)}"

    rows = [HEADER]
    for text, opts, key, diff, topic, tags, expl in MCQ:
        ca = KEY_MAP[key]
        row = [
            text,
            "mcq_single",
            opts[0],
            opts[1],
            opts[2],
            opts[3],
            ca,
            diff,
            "Mathematics",
            topic,
            tags,
            expl,
        ]
        rows.append(row)

    for text, ans, diff, topic, tags, expl in TF:
        row = [text, "true_false", "", "", "", "", ans, diff, "Mathematics", topic, tags, expl]
        rows.append(row)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerows(rows)

    print(f"Wrote {len(rows)-1} questions to {OUT}")


if __name__ == "__main__":
    main()
