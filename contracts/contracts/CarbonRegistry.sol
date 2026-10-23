// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CarbonRegistry
/// @notice On-chain mirror of the CarbonProof AI carbon-credit registry.
/// @dev Core invariant (anti-double-counting): every credit batch has a unique
///      serial, and retirements against a batch can never exceed what was
///      issued for that batch. Amounts are stored in kilograms (uint256) so
///      fractional tonnes keep full precision.
contract CarbonRegistry {
    /// @notice The account that deployed the contract. Only the admin may
    ///         issue, retire, or anchor.
    address public admin;

    struct CreditBatch {
        string serial;
        string projectName;
        string projectType;
        uint256 vintage;
        uint256 issuedKg;
        uint256 retiredKg;
        bool exists;
    }

    struct Retirement {
        string serial;
        uint256 amountKg;
        string beneficiary;
        string reason;
        uint256 timestamp;
    }

    /// @dev Batches keyed by their unique serial string.
    mapping(string => CreditBatch) private _batches;
    /// @dev All serials ever issued, in issuance order.
    string[] private _serials;

    /// @dev Append-only log of retirements.
    Retirement[] private _retirements;

    /// @dev Anchored ledger head hashes, keyed by reporting period
    ///      (e.g. "FY2025-26"). Mirrors the app's SHA-256 hash-chain head so
    ///      the off-chain ledger state can be verified against this contract.
    mapping(string => bytes32) private _anchoredHeads;

    event CreditsIssued(
        string indexed serial,
        string projectName,
        string projectType,
        uint256 vintage,
        uint256 amountKg
    );

    event CreditsRetired(
        string indexed serial,
        uint256 amountKg,
        string beneficiary,
        string reason,
        uint256 timestamp
    );

    event LedgerHeadAnchored(string indexed period, bytes32 headHash);

    modifier onlyAdmin() {
        require(msg.sender == admin, "CarbonRegistry: caller is not admin");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    /// @notice Issue a new credit batch under a unique serial.
    /// @dev Reverts on zero amount or if the serial already exists — the
    ///      unique-serial guard is what makes double issuance impossible.
    function issue(
        string calldata serial,
        string calldata projectName,
        string calldata projectType,
        uint256 vintage,
        uint256 amountKg
    ) external onlyAdmin {
        require(amountKg > 0, "CarbonRegistry: amount must be > 0");
        require(!_batches[serial].exists, "CarbonRegistry: serial already exists");

        _batches[serial] = CreditBatch({
            serial: serial,
            projectName: projectName,
            projectType: projectType,
            vintage: vintage,
            issuedKg: amountKg,
            retiredKg: 0,
            exists: true
        });
        _serials.push(serial);

        emit CreditsIssued(serial, projectName, projectType, vintage, amountKg);
    }

    /// @notice Retire credits from an existing batch.
    /// @dev Reverts if the batch does not exist, the amount is zero, or the
    ///      retirement would push total retired above total issued for the
    ///      batch (retire-never-exceeds-issued guard).
    function retire(
        string calldata serial,
        uint256 amountKg,
        string calldata beneficiary,
        string calldata reason
    ) external onlyAdmin {
        CreditBatch storage batch = _batches[serial];
        require(batch.exists, "CarbonRegistry: unknown serial");
        require(amountKg > 0, "CarbonRegistry: amount must be > 0");
        require(
            batch.retiredKg + amountKg <= batch.issuedKg,
            "CarbonRegistry: retirement exceeds issued amount"
        );

        batch.retiredKg += amountKg;

        _retirements.push(
            Retirement({
                serial: serial,
                amountKg: amountKg,
                beneficiary: beneficiary,
                reason: reason,
                timestamp: block.timestamp
            })
        );

        emit CreditsRetired(serial, amountKg, beneficiary, reason, block.timestamp);
    }

    /// @notice Anchor the head hash of the app's off-chain SHA-256 ledger for
    ///         a reporting period, so anyone can verify the ledger state
    ///         against an immutable on-chain commitment.
    function anchorLedgerHead(string calldata period, bytes32 headHash)
        external
        onlyAdmin
    {
        _anchoredHeads[period] = headHash;
        emit LedgerHeadAnchored(period, headHash);
    }

    // ------------------------------------------------------------------ views

    /// @notice Full details of one credit batch.
    function getBatch(string calldata serial)
        external
        view
        returns (
            string memory serial_,
            string memory projectName,
            string memory projectType,
            uint256 vintage,
            uint256 issuedKg,
            uint256 retiredKg,
            bool exists
        )
    {
        CreditBatch storage batch = _batches[serial];
        return (
            batch.serial,
            batch.projectName,
            batch.projectType,
            batch.vintage,
            batch.issuedKg,
            batch.retiredKg,
            batch.exists
        );
    }

    /// @notice Number of credit batches issued.
    function batchCount() external view returns (uint256) {
        return _serials.length;
    }

    /// @notice Total kilograms issued across all batches.
    function totalIssuedKg() public view returns (uint256 total) {
        for (uint256 i = 0; i < _serials.length; i++) {
            total += _batches[_serials[i]].issuedKg;
        }
    }

    /// @notice Total kilograms retired across all batches.
    function totalRetiredKg() public view returns (uint256 total) {
        for (uint256 i = 0; i < _serials.length; i++) {
            total += _batches[_serials[i]].retiredKg;
        }
    }

    /// @notice Total kilograms issued but not yet retired.
    function totalHeldKg() external view returns (uint256) {
        return totalIssuedKg() - totalRetiredKg();
    }

    /// @notice Number of retirement records.
    function retirementCount() external view returns (uint256) {
        return _retirements.length;
    }

    /// @notice One retirement record by index.
    function getRetirement(uint256 index)
        external
        view
        returns (
            string memory serial,
            uint256 amountKg,
            string memory beneficiary,
            string memory reason,
            uint256 timestamp
        )
    {
        require(index < _retirements.length, "CarbonRegistry: index out of range");
        Retirement storage r = _retirements[index];
        return (r.serial, r.amountKg, r.beneficiary, r.reason, r.timestamp);
    }

    /// @notice The anchored ledger head hash for a period (zero if none).
    function anchoredHead(string calldata period) external view returns (bytes32) {
        return _anchoredHeads[period];
    }
}
